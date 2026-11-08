"""Issuing RRA EBM receipts for sales (and refunds of them).

A receipt is saved with its number *before* it is sent, so a number is never
used twice: if the VSDC can't be reached the receipt stays "failed" and is
sent again later with the very same number and contents. Counters live on
the business's EbmConfig row and only move under a row lock.

Order RRA asks for: items are registered (/items/saveItems) before they are
sold, the sale is signed (/trnsSales/saveSales), then the stock movement
(/stock/saveStockItems) and each item's remaining quantity
(/stockMaster/saveStockMaster) are reported.
"""
import logging
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.master_data import _get as get_json
from app.core.product_client import get_product
from app.ebm import build, codes, vsdc
from app.models.ebm import EbmConfig, EbmInvoice, EbmInvoiceSale, EbmItem
from app.models.sale import Sale

logger = logging.getLogger(__name__)

MAX_LINES = 100


# ── Settings ───────────────────────────────────────────────────────────

def get_config(db: Session, shop_id: str, lock: bool = False) -> EbmConfig | None:
    q = db.query(EbmConfig).filter(EbmConfig.shop_id == shop_id)
    # Locked reads must see the row as it is now, not the session's older copy.
    return (q.with_for_update().populate_existing() if lock else q).first()


def require_ready(cfg: EbmConfig | None) -> EbmConfig:
    if not cfg or not cfg.enabled:
        raise HTTPException(status_code=400, detail="RRA EBM is off for this business. Turn it on in Settings → RRA EBM.")
    if not cfg.initialized_at or not cfg.tin:
        raise HTTPException(status_code=400, detail="Connect this business to RRA first (Settings → RRA EBM → Connect).")
    _server_ready()
    return cfg


def _server_ready():
    try:
        vsdc.base_url()
    except vsdc.NotConfigured as e:
        raise HTTPException(status_code=503, detail=str(e))


def initialize(db: Session, cfg: EbmConfig) -> EbmConfig:
    """Device initialisation (§3.3.1): RRA confirms the TIN, branch and
    device, and gives the SDC ID, MRC and the last numbers it has seen."""
    if not (cfg.tin and cfg.bhf_id and cfg.device_serial):
        raise HTTPException(status_code=400, detail="Enter the TIN, branch ID and device serial number first.")
    _server_ready()
    r = vsdc.init_info(cfg.tin, cfg.bhf_id, cfg.device_serial)
    if not r.ok and r.code != codes.DEVICE_INSTALLED:
        cfg.last_error = r.explain()
        db.commit()
        raise HTTPException(status_code=502, detail=r.explain())

    info = r.data.get("info") if isinstance(r.data.get("info"), dict) else r.data
    if info:
        cfg.taxpayer_name = build.cut(info.get("taxprNm"), 60) or cfg.taxpayer_name
        cfg.branch_name = build.cut(info.get("bhfNm"), 60) or cfg.branch_name
        cfg.device_id = build.cut(info.get("dvcId"), 20) or cfg.device_id
        cfg.sdc_id = build.cut(info.get("sdcId"), 20) or cfg.sdc_id
        cfg.mrc_no = build.cut(info.get("mrcNo"), 20) or cfg.mrc_no
        seen = [info.get(k) for k in ("lastSaleInvcNo", "lastInvcNo")]
        cfg.last_invoice_no = max([cfg.last_invoice_no or 0, *[int(x) for x in seen if isinstance(x, (int, float))]])
    cfg.initialized_at = datetime.now(timezone.utc)
    cfg.last_error = None
    db.commit()
    db.refresh(cfg)
    return cfg


def vsdc_status(cfg: EbmConfig | None) -> dict:
    """Whether receipts can be signed right now (CIS spec §7.9: the CIS
    detects on its own whether the VSDC works, and tells the user)."""
    if not cfg or not cfg.enabled or not cfg.initialized_at:
        return {"ok": False, "reason": "EBM is off or not connected to RRA."}
    try:
        vsdc.base_url()
    except vsdc.NotConfigured as e:
        return {"ok": False, "reason": str(e)}
    # A light call: codes changed since now (normally none, "001").
    r = vsdc.call("/code/selectCodes", {"tin": cfg.tin, "bhfId": cfg.bhf_id, "lastReqDt": build.dt14(build.now())},
                  timeout=8)
    if r.code in (codes.OK, codes.NO_RESULT):
        return {"ok": True, "reason": None}
    return {"ok": False, "reason": r.explain()}


def _next(db: Session, shop_id: str, counter: str) -> int:
    """The next number of a counter, under the config row's lock (held until commit)."""
    cfg = get_config(db, shop_id, lock=True)
    value = (getattr(cfg, counter) or 0) + 1
    setattr(cfg, counter, value)
    db.flush()
    return value


# ── Items ──────────────────────────────────────────────────────────────

def item_body(cfg: EbmConfig, item: EbmItem, name: str, price, user: dict) -> dict:
    uid = (user.get("user_id") or "higoverse")[:20]
    uname = build.cut(user.get("name"), 60) or "Higoverse"
    return {
        "tin": cfg.tin, "bhfId": cfg.bhf_id,
        "itemCd": item.item_code, "itemClsCd": item.item_class, "itemTyCd": item.item_type,
        "itemNm": build.cut(name, 200) or item.item_code, "itemStdNm": None,
        "orgnNatCd": item.origin, "pkgUnitCd": item.pkg_unit, "qtyUnitCd": item.qty_unit,
        "taxTyCd": item.tax_type, "btchNo": None, "bcd": None,
        "dftPrc": build.num(price), "grpPrcL1": None, "grpPrcL2": None, "grpPrcL3": None,
        "grpPrcL4": None, "grpPrcL5": None, "addInfo": None, "sftyQty": None,
        "isrcAplcbYn": "N", "useYn": "Y",
        "regrNm": uname, "regrId": uid, "modrNm": uname, "modrId": uid,
    }


def new_item(db: Session, cfg: EbmConfig, product_id: str, item_class: str | None = None,
             tax_type: str | None = None, item_type: str = "2", origin: str | None = None) -> EbmItem:
    """An item for a product, with the next item code (caller commits)."""
    cls = item_class or cfg.default_item_class
    if not cls:
        raise HTTPException(status_code=400, detail="Choose a default item classification in Settings → RRA EBM first.")
    seq = _next(db, cfg.shop_id, "last_item_seq")
    item = EbmItem(shop_id=cfg.shop_id, product_id=product_id, item_class=cls,
                   tax_type=tax_type or cfg.default_tax_type or "B", item_type=item_type,
                   origin=origin or cfg.default_origin or "RW", pkg_unit="NT", qty_unit="U")
    item.item_code = build.item_code(item.origin, item.item_type, item.pkg_unit, item.qty_unit, seq)
    db.add(item)
    db.flush()
    return item


def ensure_items(db: Session, cfg: EbmConfig, sales: list[Sale], user: dict, token: str,
                 force: bool = False) -> dict[str, EbmItem]:
    """Every sold product as an RRA item, registered with RRA. `force`
    registers them again (saveItems updates an existing item): used when RRA
    refused a receipt, e.g. after the VSDC was reinstalled and lost them."""
    ids = list(dict.fromkeys(s.product_id for s in sales))
    items = {i.product_id: i for i in db.query(EbmItem).filter(EbmItem.shop_id == cfg.shop_id,
                                                                EbmItem.product_id.in_(ids)).all()}
    missing = [pid for pid in ids if pid not in items]
    if missing:
        for pid in missing:
            items[pid] = new_item(db, cfg, pid)
        db.commit()

    done: set[str] = set()
    for s in sales:
        item = items[s.product_id]
        if (item.registered and not force) or item.id in done:
            continue
        done.add(item.id)
        product = get_product(s.product_id, token) or {}
        r = vsdc.save_item(item_body(cfg, item, product.get("name") or s.product_name or "",
                                     product.get("selling_price") or s.unit_price, user))
        if not r.ok:
            raise HTTPException(status_code=502, detail=f"RRA did not accept the item “{s.product_name}”: {r.explain()}")
        item.registered = True
        item.registered_at = datetime.now(timezone.utc)
        db.commit()
    return items


# ── Receipts ───────────────────────────────────────────────────────────

def _customer(sale: Sale, token: str) -> dict:
    if not sale.customer_id:
        return {}
    c = get_json(f"{settings.SUPPLIER_SERVICE_URL}/suppliers/{sale.customer_id}", token) or {}
    return {"tin": c.get("tin"), "name": c.get("name"), "phone": c.get("phone")}


def _clean_tin(tin: str | None) -> str | None:
    digits = "".join(ch for ch in (tin or "") if ch.isdigit())
    if not digits:
        return None
    if len(digits) != 9:
        raise HTTPException(status_code=400, detail="A customer TIN has 9 digits.")
    return digits


def lines_of(request: dict) -> list[build.Line]:
    """The lines of a receipt that was already built (for refunds and stock)."""
    return [
        build.Line(item_code=it["itemCd"], item_class=it["itemClsCd"], name=it["itemNm"],
                   pkg_unit=it["pkgUnitCd"], qty_unit=it["qtyUnitCd"], tax_type=it["taxTyCd"],
                   quantity=Decimal(str(it["qty"])), unit_price=Decimal(str(it["prc"])))
        for it in request.get("itemList") or []
    ]


def sale_ids_of(db: Session, invoice_id: str) -> list[str]:
    return [sid for (sid,) in db.query(EbmInvoiceSale.sale_id).filter(EbmInvoiceSale.invoice_id == invoice_id)
            .order_by(EbmInvoiceSale.id).all()]


def invoice_of_sale(db: Session, shop_id: str, sale_id: str) -> EbmInvoice | None:
    """The live sale receipt (S) covering a sale, if any (discarded ones don't count)."""
    return (db.query(EbmInvoice).join(EbmInvoiceSale, EbmInvoiceSale.invoice_id == EbmInvoice.id)
            .filter(EbmInvoice.shop_id == shop_id, EbmInvoiceSale.sale_id == sale_id,
                    EbmInvoice.receipt_type == codes.RECEIPT_SALE, EbmInvoice.status != "void")
            .order_by(EbmInvoice.created_at.desc()).first())


def is_refunded(db: Session, inv: EbmInvoice) -> bool:
    if not inv.refunded_by:
        return False
    r = db.query(EbmInvoice).filter(EbmInvoice.id == inv.refunded_by).first()
    return bool(r and r.status == "signed")


def sale_lock(db: Session, shop_id: str, sale_id: str) -> str | None:
    """Why a sale can't be changed or deleted: it is on an RRA receipt that
    isn't refunded. A signed receipt can only be undone by a refund; one that
    RRA refused can be discarded first."""
    inv = invoice_of_sale(db, shop_id, sale_id)
    if not inv or is_refunded(db, inv):
        return None
    if inv.status == "signed":
        return "This sale is on an RRA EBM receipt. Refund the receipt first."
    return "This sale has an RRA EBM receipt that wasn't signed. Send it again or discard it first."


def maybe_sent(inv: EbmInvoice) -> bool:
    """RRA may have this receipt even though no answer came back (the VSDC
    couldn't be reached, or the attempt never finished): it must be sent
    again unchanged, never discarded."""
    return inv.status == "pending" or (inv.error or "").endswith("(RRA 894)")


def discard(db: Session, user: dict, invoice_id: str) -> EbmInvoice:
    """Drops a receipt RRA refused, so its sales can be changed and issued again."""
    inv = db.query(EbmInvoice).filter(EbmInvoice.id == invoice_id, EbmInvoice.shop_id == user["shop_id"]).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Receipt not found")
    if inv.status != "failed" or maybe_sent(inv):
        raise HTTPException(status_code=400, detail="Only a receipt RRA refused can be discarded. Send this one again instead.")
    inv.status = "void"
    if inv.receipt_type == codes.RECEIPT_REFUND:
        orig = db.query(EbmInvoice).filter(EbmInvoice.shop_id == inv.shop_id, EbmInvoice.refunded_by == inv.id).first()
        if orig:
            orig.refunded_by = None
    db.commit()
    db.refresh(inv)
    return inv


def _sales_in_order(db: Session, shop_id: str, ids: list[str]) -> list[Sale]:
    sales = db.query(Sale).filter(Sale.shop_id == shop_id, Sale.id.in_(ids)).all()
    if len(sales) != len(ids):
        raise HTTPException(status_code=404, detail="Sale not found")
    order = {sid: i for i, sid in enumerate(ids)}
    return sorted(sales, key=lambda s: order[s.id])


def _compose(db: Session, cfg: EbmConfig, user: dict, token: str, sales: list[Sale], number: int,
             tin: str | None, name: str | None, phone: str | None, shop: dict) -> dict:
    """The receipt for these sales, as RRA wants it."""
    items = {i.product_id: i for i in db.query(EbmItem).filter(
        EbmItem.shop_id == cfg.shop_id, EbmItem.product_id.in_([s.product_id for s in sales])).all()}
    payment = codes.PAYMENT_CODES.get((sales[0].payment_method or "cash").lower(), codes.OTHER_PAYMENT)
    lines = [build.Line(item_code=items[s.product_id].item_code, item_class=items[s.product_id].item_class,
                        name=s.product_name or "", pkg_unit=items[s.product_id].pkg_unit,
                        qty_unit=items[s.product_id].qty_unit, tax_type=items[s.product_id].tax_type,
                        quantity=Decimal(s.quantity), unit_price=Decimal(str(s.unit_price)))
             for s in sales]
    return build.sale_request(
        tin=cfg.tin, bhf_id=cfg.bhf_id, invoice_no=number, lines=lines, when=build.now(),
        sale_date=sales[0].created_at or build.now(), payment_code=payment,
        user_id=user.get("user_id") or "", user_name=user.get("name") or "",
        customer_tin=tin, customer_name=name, customer_phone=phone,
        trade_name=shop.get("name") or cfg.taxpayer_name, address=shop.get("address"))


def issue(db: Session, user: dict, token: str, sale_ids: list[str], customer_tin: str | None = None,
          customer_name: str | None = None, customer_phone: str | None = None) -> EbmInvoice:
    shop_id = user["shop_id"]
    cfg = require_ready(get_config(db, shop_id))
    ids = list(dict.fromkeys(i for i in sale_ids if i))
    if not ids:
        raise HTTPException(status_code=400, detail="Choose the sales to put on the receipt.")
    if len(ids) > MAX_LINES:
        raise HTTPException(status_code=400, detail=f"A receipt can have at most {MAX_LINES} items.")
    sales = _sales_in_order(db, shop_id, ids)

    existing = _existing(db, shop_id, ids)
    if existing:
        return send(db, cfg, existing, user, token)

    ensure_items(db, cfg, sales, user, token)
    who = _customer(sales[0], token)
    tin = _clean_tin(customer_tin if customer_tin is not None else who.get("tin"))
    name = (customer_name or who.get("name") or "").strip() or None
    phone = (customer_phone or who.get("phone") or "").strip() or None
    shop = _shop(token)

    # Numbered under the lock, re-checked so two clicks can't make two receipts.
    number = _next(db, shop_id, "last_invoice_no")
    existing = _existing(db, shop_id, ids)
    if existing:
        db.rollback()
        return send(db, cfg, existing, user, token)
    req = _compose(db, cfg, user, token, sales, number, tin, name, phone, shop)
    inv = EbmInvoice(shop_id=shop_id, invoice_no=number, receipt_type=codes.RECEIPT_SALE,
                     customer_tin=tin, customer_name=build.cut(name, 60), customer_phone=build.cut(phone, 20),
                     payment_code=req["pmtTyCd"], total_amount=req["totAmt"], total_tax=req["totTaxAmt"],
                     status="pending", request=req, created_by=user.get("user_id"))
    db.add(inv)
    db.flush()
    for s in sales:
        db.add(EbmInvoiceSale(invoice_id=inv.id, sale_id=s.id, shop_id=shop_id))
    db.commit()
    inv = send(db, cfg, inv, user, token)
    if inv.status == "failed" and not maybe_sent(inv):
        # RRA refused it outright (e.g. its VSDC lost our items): register the
        # items again and send once more, same number, before giving up.
        inv = retry(db, user, token, inv.id)
    return inv


def retry(db: Session, user: dict, token: str, invoice_id: str) -> EbmInvoice:
    cfg = require_ready(get_config(db, user["shop_id"]))
    inv = db.query(EbmInvoice).filter(EbmInvoice.id == invoice_id, EbmInvoice.shop_id == user["shop_id"]).first()
    if not inv or inv.status == "void":
        raise HTTPException(status_code=404, detail="Receipt not found")
    if inv.status == "signed":
        if cfg.report_stock and inv.stock_status == "failed":
            report_stock(db, cfg, inv, user, token)
        return inv
    if inv.receipt_type == codes.RECEIPT_SALE and not maybe_sent(inv):
        # RRA refused it, so it never counted: rebuild it from the sales and
        # items as they are now (e.g. after fixing an item's class), same number.
        sales = _sales_in_order(db, inv.shop_id, sale_ids_of(db, inv.id))
        ensure_items(db, cfg, sales, user, token, force=True)
        inv.request = _compose(db, cfg, user, token, sales, inv.invoice_no, inv.customer_tin,
                               inv.customer_name, inv.customer_phone, _shop(token))
        inv.total_amount = inv.request["totAmt"]
        inv.total_tax = inv.request["totTaxAmt"]
        db.commit()
    return send(db, cfg, inv, user, token)


def _existing(db: Session, shop_id: str, ids: list[str]) -> EbmInvoice | None:
    """A live sale receipt already covering these sales. The same sales get
    it back (and a failed one is sent again); other overlaps are refused."""
    found: dict[str, EbmInvoice] = {}
    for sid in ids:
        inv = invoice_of_sale(db, shop_id, sid)
        if inv and not is_refunded(db, inv):
            found[inv.id] = inv
    if not found:
        return None
    if len(found) == 1:
        inv = next(iter(found.values()))
        if set(sale_ids_of(db, inv.id)) == set(ids):
            return inv
    raise HTTPException(status_code=409, detail="Some of these sales are already on another RRA receipt.")


def _shop(token: str) -> dict:
    s = get_json(f"{settings.SETTINGS_SERVICE_URL}/settings/", token) or {}
    return {"name": s.get("shop_name"), "address": s.get("address")}


def send(db: Session, cfg: EbmConfig, inv: EbmInvoice, user: dict, token: str) -> EbmInvoice:
    """Sends a saved receipt (again, if it failed) and keeps RRA's answer."""
    if inv.status == "signed":
        return inv
    inv.attempts = (inv.attempts or 0) + 1
    r = vsdc.save_sale(inv.request)
    if r.ok:
        d = r.data
        inv.status = "signed"
        inv.error = None
        inv.receipt_no = _int(d.get("rcptNo"))
        inv.total_receipt_no = _int(d.get("totRcptNo"))
        inv.internal_data = build.cut(d.get("intrlData"), 64)
        inv.signature = build.cut(d.get("rcptSign"), 64)
        inv.sdc_id = build.cut(d.get("sdcId"), 20) or cfg.sdc_id
        inv.mrc_no = build.cut(d.get("mrcNo"), 20) or cfg.mrc_no
        inv.signed_at_rra = build.cut(str(d.get("vsdcRcptPbctDate") or ""), 14) or build.dt14(build.now())
        inv.signed_at = datetime.now(timezone.utc)
        if inv.receipt_type == codes.RECEIPT_REFUND:
            orig = db.query(EbmInvoice).filter(EbmInvoice.shop_id == inv.shop_id, EbmInvoice.receipt_type == codes.RECEIPT_SALE,
                                               EbmInvoice.invoice_no == inv.original_invoice_no).first()
            if orig:
                orig.refunded_by = inv.id
    else:
        inv.status = "failed"
        inv.error = r.explain()
    db.commit()
    db.refresh(inv)
    if inv.status == "signed" and cfg.report_stock and inv.stock_status != "sent":
        report_stock(db, cfg, inv, user, token)
    return inv


def _int(x) -> int | None:
    try:
        return int(x)
    except (TypeError, ValueError):
        return None


def refund(db: Session, user: dict, token: str, invoice_id: str, reason: str, note: str = "",
           recipient: str = "") -> EbmInvoice:
    """A refund receipt (NR) for the whole of a signed sale receipt."""
    shop_id = user["shop_id"]
    cfg = require_ready(get_config(db, shop_id))
    if reason not in codes.REFUND_REASONS:
        raise HTTPException(status_code=400, detail="Choose why the sale is refunded.")
    orig = db.query(EbmInvoice).filter(EbmInvoice.id == invoice_id, EbmInvoice.shop_id == shop_id).first()
    if not orig or orig.receipt_type != codes.RECEIPT_SALE:
        raise HTTPException(status_code=404, detail="Receipt not found")
    if orig.status != "signed":
        raise HTTPException(status_code=400, detail="Only a receipt RRA has signed can be refunded.")
    if orig.refunded_by:
        prev = db.query(EbmInvoice).filter(EbmInvoice.id == orig.refunded_by).first()
        if prev:
            return prev if prev.status == "signed" else send(db, cfg, prev, user, token)

    number = _next(db, shop_id, "last_invoice_no")
    db.refresh(orig)   # read again under the lock: another click may have refunded it
    if orig.refunded_by:
        other = orig.refunded_by
        db.rollback()
        return db.query(EbmInvoice).filter(EbmInvoice.id == other).first()
    o = orig.request
    req = build.sale_request(
        tin=cfg.tin, bhf_id=cfg.bhf_id, invoice_no=number, lines=lines_of(o), when=build.now(),
        sale_date=build.now(), payment_code=orig.payment_code,
        user_id=user.get("user_id") or "", user_name=user.get("name") or "",
        customer_tin=orig.customer_tin, customer_name=orig.customer_name, customer_phone=orig.customer_phone,
        trade_name=(o.get("receipt") or {}).get("trdeNm"), address=(o.get("receipt") or {}).get("adrs"),
        refund_of=orig.invoice_no, refund_reason=reason)
    inv = EbmInvoice(shop_id=shop_id, invoice_no=number, original_invoice_no=orig.invoice_no,
                     receipt_type=codes.RECEIPT_REFUND, refund_reason=reason,
                     refund_note=note.strip() or None, refund_recipient=build.cut(recipient, 100),
                     customer_tin=orig.customer_tin, customer_name=orig.customer_name,
                     customer_phone=orig.customer_phone, payment_code=orig.payment_code,
                     total_amount=req["totAmt"], total_tax=req["totTaxAmt"], status="pending",
                     request=req, created_by=user.get("user_id"))
    db.add(inv)
    db.flush()
    # Pointing at the refund at once stops a second refund being numbered.
    orig.refunded_by = inv.id
    for sid in sale_ids_of(db, orig.id):
        db.add(EbmInvoiceSale(invoice_id=inv.id, sale_id=sid, shop_id=shop_id))
    db.commit()
    return send(db, cfg, inv, user, token)


# ── Stock ──────────────────────────────────────────────────────────────

def report_stock(db: Session, cfg: EbmConfig, inv: EbmInvoice, user: dict, token: str) -> None:
    """Stock out (sale) or back in (refund), then each item's remaining
    quantity. Services carry no stock and are left out. Never undoes the
    receipt: a failure is kept on it and can be sent again."""
    lines = lines_of(inv.request)
    items = {i.item_code: i for i in db.query(EbmItem).filter(
        EbmItem.shop_id == inv.shop_id, EbmItem.item_code.in_([l.item_code for l in lines])).all()}
    goods = [l for l in lines if (items.get(l.item_code) and items[l.item_code].item_type != "3")]
    if not goods:
        inv.stock_status = "skipped"
        db.commit()
        return
    if not inv.stock_no:
        inv.stock_no = _next(db, inv.shop_id, "last_stock_no")
        db.commit()
    body = build.stock_request(
        tin=cfg.tin, bhf_id=cfg.bhf_id, stock_no=inv.stock_no, lines=goods, when=build.now(),
        stock_type=codes.STOCK_IN_RETURN if inv.receipt_type == codes.RECEIPT_REFUND else codes.STOCK_OUT_SALE,
        user_id=user.get("user_id") or "", user_name=user.get("name") or "",
        customer_tin=inv.customer_tin, customer_name=inv.customer_name)
    r = vsdc.save_stock_io(body)
    errors = [] if r.ok or r.code == codes.DUPLICATE else [r.explain()]
    if not errors:
        uid = (user.get("user_id") or "higoverse")[:20]
        uname = build.cut(user.get("name"), 60) or "Higoverse"
        for l in goods:
            product = get_product(items[l.item_code].product_id, token)
            if not product:
                continue
            m = vsdc.save_stock_master({"tin": cfg.tin, "bhfId": cfg.bhf_id, "itemCd": l.item_code,
                                        "rsdQty": build.num(product.get("quantity") or 0),
                                        "regrNm": uname, "regrId": uid, "modrNm": uname, "modrId": uid})
            if not m.ok:
                errors.append(m.explain())
    inv.stock_status = "failed" if errors else "sent"
    inv.stock_error = "; ".join(errors) or None
    db.commit()


# ── Every sale, whichever app records it ───────────────────────────────

def guard_sale(db: Session, shop_id: str) -> EbmConfig | None:
    """Before recording a sale: with EBM on, RRA's VSDC must be able to sign
    it (CIS spec §7.8, §24.7.9), else no sale. Returns the business's EBM
    settings when EBM is on, None when it is off."""
    cfg = get_config(db, shop_id)
    if not cfg or not cfg.enabled:
        return None
    st = vsdc_status(cfg)
    if not st["ok"]:
        raise HTTPException(status_code=503, detail=f"Sales are paused: RRA's EBM can't sign receipts right now. {st['reason'] or ''}".strip())
    return cfg


def sign_new_sales(db: Session, user: dict, token: str, sale_ids: list[str]) -> dict:
    """Signs sales just recorded as one receipt. Never undoes the sale: a
    failure is kept on the receipt (or reported) so it can be sent again."""
    try:
        inv = issue(db, user, token, sale_ids)
        return {"id": inv.id, "invoice_no": inv.invoice_no, "status": inv.status, "label": build.receipt_label(inv.receipt_type),
                "receipt_no": inv.receipt_no, "total_receipt_no": inv.total_receipt_no, "error": inv.error}
    except HTTPException as e:
        db.rollback()
        return {"id": None, "status": "failed", "error": str(e.detail)}


def unsigned_sales(db: Session, cfg: EbmConfig) -> list[tuple[str, str | None]]:
    """(sale id, its unsigned receipt id or None) for every sale recorded
    since EBM was turned on that has no signed RRA receipt — oldest first."""
    since = cfg.enabled_at or cfg.initialized_at
    if not since:
        return []
    links = (db.query(EbmInvoiceSale.sale_id, EbmInvoice.id, EbmInvoice.status)
             .join(EbmInvoice, EbmInvoice.id == EbmInvoiceSale.invoice_id)
             .filter(EbmInvoiceSale.shop_id == cfg.shop_id, EbmInvoice.receipt_type == codes.RECEIPT_SALE,
                     EbmInvoice.status != "void").all())
    signed = {sid for sid, _, st in links if st == "signed"}
    waiting = {sid: iid for sid, iid, st in links if st != "signed"}
    sales = (db.query(Sale.id).filter(Sale.shop_id == cfg.shop_id, Sale.created_at >= since)
             .order_by(Sale.created_at).all())
    return [(sid, waiting.get(sid)) for (sid,) in sales if sid not in signed]
