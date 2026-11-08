"""RRA EBM: settings, items and receipts (/ebm). See app/ebm/."""
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.database import get_db
from app.core.master_data import _get as get_json
from app.core.config import settings
from app.ebm import build, codes, reports, service, vsdc
from app.models.ebm import EbmCashMove, EbmConfig, EbmCopyLog, EbmInvoice, EbmInvoiceSale, EbmItem, EbmItemClass, EbmZReport
from app.schemas.ebm import (EbmCashMoveIn, EbmCloseDay, EbmConfigUpdate, EbmIssue, EbmItemUpdate, EbmLookup,
                             EbmRefund)

router = APIRouter(prefix="/ebm", tags=["RRA EBM"])

OWNERS = {"owner", "admin"}
MANAGERS = {"owner", "admin", "manager"}


def _need_shop(user: dict) -> str:
    if not user.get("shop_id"):
        raise HTTPException(status_code=400, detail="You need a business first")
    return user["shop_id"]


def _need_role(user: dict, roles: set[str]):
    if user.get("role") not in roles:
        raise HTTPException(status_code=403, detail="Only the owner or a manager can do this.")


def _token(authorization: str | None) -> str:
    return authorization.replace("Bearer ", "") if authorization else ""


def _server_ready() -> bool:
    try:
        vsdc.base_url()
        return True
    except vsdc.NotConfigured:
        return False


# ── Formatting ─────────────────────────────────────────────────────────

def _fmt_config(c: EbmConfig | None, shop_id: str) -> dict:
    c = c or EbmConfig(shop_id=shop_id, enabled=False, auto_issue=True, report_stock=True, bhf_id="00",
                       default_tax_type="B", last_invoice_no=0)
    return {
        "enabled": bool(c.enabled), "auto_issue": bool(c.auto_issue), "report_stock": bool(c.report_stock),
        "tin": c.tin, "bhf_id": c.bhf_id or "00", "device_serial": c.device_serial,
        "default_item_class": c.default_item_class, "default_tax_type": c.default_tax_type or "B",
        "default_origin": c.default_origin or "RW",
        "taxpayer_name": c.taxpayer_name, "branch_name": c.branch_name,
        "device_id": c.device_id, "sdc_id": c.sdc_id, "mrc_no": c.mrc_no,
        "connected": bool(c.initialized_at),
        "connected_at": c.initialized_at.isoformat() if c.initialized_at else None,
        "last_invoice_no": c.last_invoice_no or 0,
        "last_error": c.last_error,
        "server_ready": _server_ready(),
        "cis_version": f"{codes.CIS_NAME} {codes.CIS_VERSION}",
        # Ready to sign receipts: on, connected, and the server has a VSDC.
        "ready": bool(c.enabled and c.initialized_at and c.tin and _server_ready()),
    }


def _fmt_item(i: EbmItem) -> dict:
    return {
        "product_id": i.product_id, "item_code": i.item_code, "item_class": i.item_class, "origin": i.origin,
        "item_type": i.item_type, "tax_type": i.tax_type, "registered": bool(i.registered),
    }


def _fmt_invoice(db: Session, inv: EbmInvoice) -> dict:
    req = inv.request or {}
    lines = [{
        "name": it.get("itemNm"), "item_code": it.get("itemCd"), "tax_type": it.get("taxTyCd"),
        "quantity": it.get("qty"), "unit_price": it.get("prc"), "total": it.get("totAmt"), "tax": it.get("taxAmt"),
    } for it in req.get("itemList") or []]
    taxes = {t: {"label": codes.TAX_LABELS[t], "rate": req.get(f"taxRt{t}", codes.TAX_RATES[t]),
                 "taxable": req.get(f"taxblAmt{t}", 0), "tax": req.get(f"taxAmt{t}", 0)}
             for t in ("A", "B", "C", "D")}
    return {
        "id": inv.id,
        "invoice_no": inv.invoice_no,
        "original_invoice_no": inv.original_invoice_no or None,
        "receipt_type": inv.receipt_type,
        "label": build.receipt_label(inv.receipt_type),
        "status": inv.status,
        "error": inv.error,
        "attempts": inv.attempts,
        "can_discard": inv.status == "failed" and not service.maybe_sent(inv),
        "customer_tin": inv.customer_tin,
        "customer_name": inv.customer_name,
        "customer_phone": inv.customer_phone,
        "payment_code": inv.payment_code,
        "payment_label": codes.PAYMENT_LABELS.get(inv.payment_code, inv.payment_code),
        "total_amount": float(inv.total_amount or 0),
        "total_tax": float(inv.total_tax or 0),
        "taxes": taxes,
        "lines": lines,
        "receipt_no": inv.receipt_no,
        "total_receipt_no": inv.total_receipt_no,
        "internal_data": inv.internal_data,
        "signature": inv.signature,
        "internal_data_grouped": build.grouped(inv.internal_data),
        "signature_grouped": build.grouped(inv.signature),
        "sdc_id": inv.sdc_id,
        "mrc_no": inv.mrc_no,
        "signed_at_rra": inv.signed_at_rra,
        "signed_at": inv.signed_at.isoformat() if inv.signed_at else None,
        "qr_text": build.receipt_qr_text(signed_at_rra=inv.signed_at_rra, sdc_id=inv.sdc_id, receipt_no=inv.receipt_no,
                                         total_receipt_no=inv.total_receipt_no, receipt_type=inv.receipt_type,
                                         internal_data=inv.internal_data, signature=inv.signature)
                   if inv.status == "signed" else None,
        # Who issued it, as printed: "CASHIER: Name".
        "cashier": req.get("regrNm"),
        "refunded_by": inv.refunded_by,
        "refunded": service.is_refunded(db, inv) if inv.receipt_type == codes.RECEIPT_SALE else False,
        "refund_reason": inv.refund_reason,
        "refund_reason_label": codes.REFUND_REASONS.get(inv.refund_reason or ""),
        "refund_note": inv.refund_note,
        "refund_recipient": inv.refund_recipient,
        # CIS date and time of the receipt (cfmDt), printed under "RECEIPT NUMBER".
        "issued_at_cis": req.get("cfmDt"),
        "items_count": len(lines),
        "stock_status": inv.stock_status,
        "stock_error": inv.stock_error,
        "sale_ids": service.sale_ids_of(db, inv.id),
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
    }


def _invoice_or_404(db: Session, shop_id: str, invoice_id: str) -> EbmInvoice:
    inv = db.query(EbmInvoice).filter(EbmInvoice.id == invoice_id, EbmInvoice.shop_id == shop_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Receipt not found")
    return inv


# ── Settings ───────────────────────────────────────────────────────────

@router.get("/config")
def get_config(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    shop_id = _need_shop(user)
    return {"success": True, "data": _fmt_config(service.get_config(db, shop_id), shop_id),
            "codes": {"tax_types": codes.TAX_LABELS, "item_types": codes.ITEM_TYPES,
                      "refund_reasons": codes.REFUND_REASONS}}


@router.put("/config")
def update_config(payload: EbmConfigUpdate, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    shop_id = _need_shop(user)
    _need_role(user, OWNERS)
    cfg = service.get_config(db, shop_id)
    if not cfg:
        cfg = EbmConfig(shop_id=shop_id, enabled=False, auto_issue=True, report_stock=True, bhf_id="00",
                        default_tax_type="B", last_invoice_no=0, last_stock_no=0, last_item_seq=0)
        db.add(cfg)
    data = payload.model_dump(exclude_unset=True)
    device_keys = ("tin", "bhf_id", "device_serial")
    changes_device = any(k in data and data[k] != getattr(cfg, k) for k in device_keys)
    if changes_device:
        used = db.query(EbmInvoice.id).filter(EbmInvoice.shop_id == shop_id).first()
        if used and cfg.tin:
            raise HTTPException(status_code=400, detail="Receipts were already issued with this TIN and device; they can't be changed.")
        cfg.initialized_at = None   # a different device must be connected again
        cfg.sdc_id = cfg.mrc_no = cfg.device_id = None
    if data.get("enabled") and not cfg.enabled:
        cfg.enabled_at = datetime.now(timezone.utc)
    for k, v in data.items():
        setattr(cfg, k, v)
    if cfg.enabled and not cfg.default_item_class:
        raise HTTPException(status_code=400, detail="Choose a default item classification before turning EBM on.")
    db.commit()
    db.refresh(cfg)
    return {"success": True, "data": _fmt_config(cfg, shop_id)}


@router.post("/config/connect")
def connect(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    """Initialises the device with RRA (once per TIN, branch and device)."""
    shop_id = _need_shop(user)
    _need_role(user, OWNERS)
    cfg = service.get_config(db, shop_id)
    if not cfg:
        raise HTTPException(status_code=400, detail="Save the TIN, branch ID and device serial number first.")
    return {"success": True, "data": _fmt_config(service.initialize(db, cfg), shop_id)}


# ── RRA reference data ─────────────────────────────────────────────────

@router.get("/item-classes")
def item_classes(q: str = Query("", max_length=60), limit: int = Query(30, ge=1, le=100),
                 db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    _need_shop(user)
    query = db.query(EbmItemClass).filter(EbmItemClass.in_use.is_(True))
    words = q.strip()
    if words:
        query = query.filter(or_(EbmItemClass.code.like(f"{words}%"), EbmItemClass.name.ilike(f"%{words}%")))
    rows = query.order_by(EbmItemClass.level.desc().nullslast(), EbmItemClass.code).limit(limit).all()
    total = db.query(EbmItemClass.code).count()
    return {"success": True, "data": [{"code": r.code, "name": r.name, "level": r.level, "tax_type": r.tax_type}
                                       for r in rows], "cached": total}


@router.post("/item-classes/sync")
def sync_item_classes(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    """Downloads RRA's item classification list (shared by every business)."""
    shop_id = _need_shop(user)
    _need_role(user, OWNERS)
    cfg = service.get_config(db, shop_id)
    if not cfg or not cfg.initialized_at:
        raise HTTPException(status_code=400, detail="Connect to RRA first.")
    r = vsdc.item_classes(cfg.tin, cfg.bhf_id)
    if not r.ok:
        raise HTTPException(status_code=502, detail=r.explain())
    rows = [x for x in (r.data.get("itemClsList") or []) if isinstance(x, dict) and x.get("itemClsCd")]
    known = {c for (c,) in db.query(EbmItemClass.code).all()}
    now = datetime.now(timezone.utc)
    new, old = [], []
    for x in rows:
        rec = {"code": str(x["itemClsCd"])[:10], "name": (x.get("itemClsNm") or "")[:200],
               "level": x.get("itemClsLvl") if isinstance(x.get("itemClsLvl"), int) else None,
               "tax_type": (x.get("taxTyCd") or None) and str(x["taxTyCd"])[:1],
               "in_use": x.get("useYn", "Y") == "Y", "synced_at": now}
        (old if rec["code"] in known else new).append(rec)
        known.add(rec["code"])
    if new:
        db.bulk_insert_mappings(EbmItemClass, new)
    if old:
        db.bulk_update_mappings(EbmItemClass, old)
    db.commit()
    return {"success": True, "data": {"count": len(rows)}}


@router.get("/customers/{tin}")
def taxpayer(tin: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    """A Rwandan taxpayer's registered name, by TIN (for the customer on a receipt)."""
    cfg = service.require_ready(service.get_config(db, _need_shop(user)))
    digits = "".join(ch for ch in tin if ch.isdigit())
    if len(digits) != 9:
        raise HTTPException(status_code=400, detail="A TIN has 9 digits.")
    r = vsdc.customer(cfg.tin, cfg.bhf_id, digits)
    if r.code == codes.NO_RESULT:
        raise HTTPException(status_code=404, detail="RRA has no taxpayer with this TIN.")
    if not r.ok:
        raise HTTPException(status_code=502, detail=r.explain())
    found = (r.data.get("custList") or [{}])[0]
    return {"success": True, "data": {"tin": found.get("tin") or digits, "name": found.get("taxprNm"),
                                      "status": found.get("taxprSttsCd"), "district": found.get("dstrtNm")}}


# ── Items ──────────────────────────────────────────────────────────────

@router.get("/items")
def list_items(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    shop_id = _need_shop(user)
    rows = db.query(EbmItem).filter(EbmItem.shop_id == shop_id).all()
    return {"success": True, "data": [_fmt_item(i) for i in rows]}


@router.put("/items/{product_id}")
def update_item(product_id: str, payload: EbmItemUpdate, db: Session = Depends(get_db),
                user: dict = Depends(get_current_user)):
    """A product's RRA details. Sent to RRA again with its next sale."""
    shop_id = _need_shop(user)
    _need_role(user, MANAGERS)
    cfg = service.get_config(db, shop_id)
    if not cfg:
        raise HTTPException(status_code=400, detail="Set up RRA EBM in Settings first.")
    data = payload.model_dump(exclude_unset=True, exclude_none=True)
    item = db.query(EbmItem).filter(EbmItem.shop_id == shop_id, EbmItem.product_id == product_id).first()
    if not item:
        item = service.new_item(db, cfg, product_id, data.get("item_class"), data.get("tax_type"),
                                data.get("item_type") or "2", data.get("origin"))
    else:
        # The item code carries the type and the origin country, so they can
        # only change before RRA knows the code (the code is then rebuilt).
        coded = {k: data[k] for k in ("item_type", "origin") if k in data and data[k] != getattr(item, k)}
        if coded and item.registered:
            raise HTTPException(status_code=400, detail="This product was already declared to RRA; its type and origin can't change.")
        if coded:
            seq = int(item.item_code[-7:])
            for k, v in coded.items():
                setattr(item, k, v)
            item.item_code = build.item_code(item.origin, item.item_type, item.pkg_unit, item.qty_unit, seq)
    for k, v in data.items():
        if getattr(item, k) != v:
            setattr(item, k, v)
            item.registered = False
    db.commit()
    db.refresh(item)
    return {"success": True, "data": _fmt_item(item)}


# ── Receipts ───────────────────────────────────────────────────────────

@router.post("/invoices")
def issue(payload: EbmIssue, db: Session = Depends(get_db), user: dict = Depends(get_current_user),
          authorization: str = Header(None)):
    """Signs these sales with RRA as one receipt (or returns the one they have)."""
    _need_shop(user)
    inv = service.issue(db, user, _token(authorization), payload.sale_ids, payload.customer_tin,
                        payload.customer_name, payload.customer_phone)
    return {"success": inv.status == "signed", "data": _fmt_invoice(db, inv)}


@router.get("/invoices")
def list_invoices(status: str | None = Query(None, pattern="^(pending|signed|failed|void)$"),
                  page: int = Query(1, ge=1), limit: int = Query(25, ge=1, le=100),
                  db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    shop_id = _need_shop(user)
    q = db.query(EbmInvoice).filter(EbmInvoice.shop_id == shop_id)
    if status:
        q = q.filter(EbmInvoice.status == status)
    total = q.count()
    rows = q.order_by(EbmInvoice.invoice_no.desc()).offset((page - 1) * limit).limit(limit).all()
    return {"success": True, "data": {"items": [_fmt_invoice(db, i) for i in rows], "total": total,
                                      "page": page, "limit": limit}}


@router.post("/invoices/lookup")
def lookup(payload: EbmLookup, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    """{sale_id: {id, status, refunded}} for the sales shown in a list."""
    shop_id = _need_shop(user)
    if not payload.sale_ids:
        return {"success": True, "data": {}}
    rows = (db.query(EbmInvoiceSale.sale_id, EbmInvoice)
            .join(EbmInvoice, EbmInvoice.id == EbmInvoiceSale.invoice_id)
            .filter(EbmInvoiceSale.shop_id == shop_id, EbmInvoiceSale.sale_id.in_(payload.sale_ids),
                    EbmInvoice.receipt_type == codes.RECEIPT_SALE, EbmInvoice.status != "void")
            .order_by(EbmInvoice.created_at).all())
    out = {}
    for sid, inv in rows:
        out[sid] = {"id": inv.id, "invoice_no": inv.invoice_no, "status": inv.status,
                    "refunded": service.is_refunded(db, inv)}
    return {"success": True, "data": out}


@router.get("/invoices/by-sale/{sale_id}")
def by_sale(sale_id: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    shop_id = _need_shop(user)
    inv = service.invoice_of_sale(db, shop_id, sale_id)
    if not inv:
        return {"success": True, "data": None}
    return {"success": True, "data": _fmt_invoice(db, inv)}


@router.get("/invoices/{invoice_id}")
def get_invoice(invoice_id: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    return {"success": True, "data": _fmt_invoice(db, _invoice_or_404(db, _need_shop(user), invoice_id))}


@router.post("/invoices/{invoice_id}/retry")
def retry(invoice_id: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user),
          authorization: str = Header(None)):
    inv = service.retry(db, user, _token(authorization), _invoice_or_404(db, _need_shop(user), invoice_id).id)
    return {"success": inv.status == "signed", "data": _fmt_invoice(db, inv)}


@router.post("/invoices/{invoice_id}/refund")
def refund(invoice_id: str, payload: EbmRefund, db: Session = Depends(get_db),
           user: dict = Depends(get_current_user), authorization: str = Header(None)):
    _need_role(user, MANAGERS)
    inv = service.refund(db, user, _token(authorization), _invoice_or_404(db, _need_shop(user), invoice_id).id,
                         payload.reason, payload.note, payload.recipient)
    return {"success": inv.status == "signed", "data": _fmt_invoice(db, inv)}


@router.post("/invoices/{invoice_id}/discard")
def discard(invoice_id: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    _need_role(user, MANAGERS)
    inv = service.discard(db, user, _invoice_or_404(db, _need_shop(user), invoice_id).id)
    return {"success": True, "data": _fmt_invoice(db, inv)}


# ── VSDC status, copies, cash, reports (CIS specification) ─────────────

@router.get("/status")
def status(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    """Whether sales can be signed right now. The app checks it before a sale
    and refuses to sell while RRA's VSDC can't be reached (CIS spec §7.9)."""
    return {"success": True, "data": service.vsdc_status(service.get_config(db, _need_shop(user)))}


@router.get("/unsigned")
def unsigned(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    """Sales recorded since EBM was turned on that RRA hasn't signed."""
    cfg = service.get_config(db, _need_shop(user))
    rows = service.unsigned_sales(db, cfg) if cfg and cfg.enabled else []
    return {"success": True, "data": {"count": len(rows), "sale_ids": [r[0] for r in rows][:500]}}


@router.post("/sign-pending")
def sign_pending(db: Session = Depends(get_db), user: dict = Depends(get_current_user),
                 authorization: str = Header(None)):
    """Sends every unsigned sale to RRA (up to 50 per call): failed receipts
    again with their own number, sales without a receipt as new receipts."""
    shop_id = _need_shop(user)
    cfg = service.require_ready(service.get_config(db, shop_id))
    token = _token(authorization)
    signed = failed = 0
    errors: list[str] = []
    seen: set[str] = set()
    for sale_id, inv_id in service.unsigned_sales(db, cfg)[:50]:
        if inv_id in seen:
            continue
        if inv_id:
            seen.add(inv_id)
            try:
                inv = service.retry(db, user, token, inv_id)
                r = {"status": inv.status, "error": inv.error}
            except HTTPException as e:
                db.rollback()
                r = {"status": "failed", "error": str(e.detail)}
        else:
            r = service.sign_new_sales(db, user, token, [sale_id])
        if r["status"] == "signed":
            signed += 1
        else:
            failed += 1
            if r.get("error") and r["error"] not in errors:
                errors.append(r["error"])
    left = len(service.unsigned_sales(db, cfg))
    return {"success": failed == 0, "data": {"signed": signed, "failed": failed, "left": left, "errors": errors[:5]}}


@router.post("/invoices/{invoice_id}/copy")
def log_copy(invoice_id: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    """A reprint of a signed receipt: printed as COPY, counted on X/Z reports."""
    shop_id = _need_shop(user)
    inv = _invoice_or_404(db, shop_id, invoice_id)
    if inv.status != "signed":
        raise HTTPException(status_code=400, detail="Only a receipt RRA signed can be reprinted.")
    label = "CR" if inv.receipt_type == codes.RECEIPT_REFUND else "CS"
    db.add(EbmCopyLog(shop_id=shop_id, invoice_id=inv.id, label=label, amount=inv.total_amount,
                      created_by=user.get("user_id")))
    db.commit()
    return {"success": True, "data": {"label": label}}


@router.post("/cash")
def cash_move(payload: EbmCashMoveIn, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    """Cash put into the till (opening deposit) or taken out (CIS spec §7.12)."""
    shop_id = _need_shop(user)
    m = EbmCashMove(shop_id=shop_id, kind=payload.kind, amount=build.money(payload.amount),
                    note=build.cut(payload.note, 200), created_by=user.get("user_id"),
                    created_by_name=build.cut(user.get("name"), 60))
    db.add(m)
    db.commit()
    db.refresh(m)
    return {"success": True, "data": _fmt_move(m)}


@router.get("/cash")
def list_cash(day: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"), db: Session = Depends(get_db),
              user: dict = Depends(get_current_user)):
    shop_id = _need_shop(user)
    start, end = reports.day_bounds(date.fromisoformat(day) if day else datetime.now(build.KIGALI).date())
    rows = (db.query(EbmCashMove).filter(EbmCashMove.shop_id == shop_id, EbmCashMove.created_at >= start,
                                         EbmCashMove.created_at <= end).order_by(EbmCashMove.created_at).all())
    return {"success": True, "data": [_fmt_move(m) for m in rows]}


def _fmt_move(m: EbmCashMove) -> dict:
    return {"id": m.id, "kind": m.kind, "amount": float(m.amount), "note": m.note, "by": m.created_by_name,
            "at": m.created_at.isoformat() if m.created_at else None}


def _ready_config(db: Session, user: dict) -> EbmConfig:
    cfg = service.get_config(db, _need_shop(user))
    if not cfg or not cfg.initialized_at:
        raise HTTPException(status_code=400, detail="Connect this business to RRA first (Settings → RRA EBM).")
    return cfg


@router.get("/reports/x")
def x_report(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    """X daily report: sales since the last Z report (CIS spec §18)."""
    return {"success": True, "data": reports.x_report(db, _ready_config(db, user))}


@router.post("/reports/z")
def z_report(payload: EbmCloseDay, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    """Closes a day with its Z report (CIS spec §19). Owner or manager."""
    _need_role(user, MANAGERS)
    cfg = _ready_config(db, user)
    day = date.fromisoformat(payload.day) if payload.day else datetime.now(build.KIGALI).date()
    try:
        z = reports.close_day(db, cfg, day, user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"success": True, "data": _fmt_z(z)}


@router.get("/reports/z")
def list_z(db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    shop_id = _need_shop(user)
    rows = db.query(EbmZReport).filter(EbmZReport.shop_id == shop_id).order_by(EbmZReport.number.desc()).limit(400).all()
    return {"success": True, "data": [{"number": z.number, "day": z.day, "net_total": (z.data or {}).get("net_total"),
                                       "created_at": z.created_at.isoformat() if z.created_at else None} for z in rows]}


@router.get("/reports/z/{number}")
def get_z(number: int, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    shop_id = _need_shop(user)
    z = db.query(EbmZReport).filter(EbmZReport.shop_id == shop_id, EbmZReport.number == number).first()
    if not z:
        raise HTTPException(status_code=404, detail="Z report not found")
    return {"success": True, "data": _fmt_z(z)}


def _fmt_z(z: EbmZReport) -> dict:
    return {**(z.data or {}), "number": z.number, "day": z.day, "closed_by": z.created_by_name,
            "closed_at": z.created_at.isoformat() if z.created_at else None}


def _products(token: str) -> dict[str, dict]:
    """The business's products (id → product), for stock figures."""
    data = get_json(f"{settings.PRODUCT_SERVICE_URL}/products?limit=5000", token) or {}
    items = data.get("items") if isinstance(data, dict) else data
    return {p["id"]: p for p in (items or []) if isinstance(p, dict) and p.get("id")}


def _period(from_date: str | None, to_date: str | None) -> tuple[datetime, datetime]:
    today = datetime.now(build.KIGALI).date()
    a = date.fromisoformat(from_date) if from_date else today
    b = date.fromisoformat(to_date) if to_date else today
    if b < a:
        raise HTTPException(status_code=400, detail="The end date is before the start date.")
    if (b - a) > timedelta(days=366):
        raise HTTPException(status_code=400, detail="Choose at most one year.")
    return reports.day_bounds(a)[0], reports.day_bounds(b)[1]


@router.get("/reports/plu")
def plu_report(from_date: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
               to_date: str | None = Query(None, pattern=r"^\d{4}-\d{2}-\d{2}$"),
               db: Session = Depends(get_db), user: dict = Depends(get_current_user),
               authorization: str = Header(None)):
    """PLU report: each item sold in the period with its stock now (CIS spec §21)."""
    cfg = _ready_config(db, user)
    start, end = _period(from_date, to_date)
    stock = {pid: p.get("quantity") for pid, p in _products(_token(authorization)).items()}
    return {"success": True, "data": reports.plu(db, cfg, start, end, stock)}


@router.get("/reports/stock")
def stock_report(day: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"), db: Session = Depends(get_db),
                 user: dict = Depends(get_current_user), authorization: str = Header(None)):
    """Closing stock on a given date (CIS spec §7.31)."""
    shop_id = _need_shop(user)
    d = date.fromisoformat(day)
    if d > datetime.now(build.KIGALI).date():
        raise HTTPException(status_code=400, detail="Choose today or an earlier day.")
    rows = reports.closing_stock(db, shop_id, d, _products(_token(authorization)))
    return {"success": True, "data": {"day": day, "items": rows}}
