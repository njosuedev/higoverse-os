"""The reports RRA requires of a Certified Invoicing System (Technical
Specification of CIS for VSDC, v1.0, March 2018):

- X daily report (§18): sales since the last Z report, at any time.
- Z daily report (§19): a closed day, numbered, kept as a business record.
- PLU report (§21): each item sold in a period, with the stock remaining.
- Closing stock on a given date (§7.31).

They are built only from receipts RRA signed (NS sales, NR refunds), the
cash deposits/withdrawals (§7.12) and the copies printed (CS/CR), so they
match what RRA has.
"""
from collections import defaultdict
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.ebm import build, codes
from app.models.ebm import EbmCashMove, EbmConfig, EbmCopyLog, EbmInvoice, EbmItem, EbmZReport
from app.models.sale import Sale

TAX_TYPES = ("A", "B", "C", "D")
EPOCH = datetime(2000, 1, 1, tzinfo=timezone.utc)


def _d(x) -> Decimal:
    return build.money(x)


def day_bounds(day) -> tuple[datetime, datetime]:
    """A calendar day in Kigali: 00:00:00 to 23:59:59.999999."""
    start = datetime.combine(day, time.min, tzinfo=build.KIGALI)
    return start, start + timedelta(days=1) - timedelta(microseconds=1)


def last_z(db: Session, shop_id: str) -> EbmZReport | None:
    return db.query(EbmZReport).filter(EbmZReport.shop_id == shop_id).order_by(EbmZReport.number.desc()).first()


def summary(db: Session, cfg: EbmConfig, start: datetime, end: datetime) -> dict:
    """Everything §18.1 / §19.1 lists, for receipts signed in [start, end]."""
    invs = (db.query(EbmInvoice)
            .filter(EbmInvoice.shop_id == cfg.shop_id, EbmInvoice.status == "signed",
                    EbmInvoice.signed_at >= start, EbmInvoice.signed_at <= end)
            .order_by(EbmInvoice.invoice_no).all())
    kinds = {codes.RECEIPT_SALE: "NS", codes.RECEIPT_REFUND: "NR"}
    out = {k: {"count": 0, "total": Decimal("0.00"), "items": Decimal("0"),
               "taxable": {t: Decimal("0.00") for t in TAX_TYPES}, "tax": {t: Decimal("0.00") for t in TAX_TYPES},
               "by_payment": defaultdict(lambda: Decimal("0.00"))} for k in kinds.values()}
    for inv in invs:
        o = out[kinds[inv.receipt_type]]
        req = inv.request or {}
        o["count"] += 1
        o["total"] += _d(req.get("totAmt"))
        for t in TAX_TYPES:
            o["taxable"][t] += _d(req.get(f"taxblAmt{t}"))
            o["tax"][t] += _d(req.get(f"taxAmt{t}"))
        o["items"] += sum((Decimal(str(it.get("qty") or 0)) for it in req.get("itemList") or []), Decimal("0"))
        o["by_payment"][codes.PAYMENT_LABELS.get(inv.payment_code, inv.payment_code)] += _d(req.get("totAmt"))

    moves = (db.query(EbmCashMove.kind, func.coalesce(func.sum(EbmCashMove.amount), 0), func.count(EbmCashMove.id))
             .filter(EbmCashMove.shop_id == cfg.shop_id, EbmCashMove.created_at >= start, EbmCashMove.created_at <= end)
             .group_by(EbmCashMove.kind).all())
    cash = {k: {"amount": _d(a), "count": n} for k, a, n in moves}
    copies = (db.query(EbmCopyLog.label, func.count(EbmCopyLog.id), func.coalesce(func.sum(EbmCopyLog.amount), 0))
              .filter(EbmCopyLog.shop_id == cfg.shop_id, EbmCopyLog.created_at >= start, EbmCopyLog.created_at <= end)
              .group_by(EbmCopyLog.label).all())
    copy = {lbl: {"count": n, "amount": _d(a)} for lbl, n, a in copies}
    incomplete = (db.query(func.count(EbmInvoice.id))
                  .filter(EbmInvoice.shop_id == cfg.shop_id, EbmInvoice.status.in_(("pending", "failed")),
                          EbmInvoice.created_at >= start, EbmInvoice.created_at <= end).scalar() or 0)

    def side(o):
        return {
            "count": o["count"], "total": float(o["total"]), "items": float(o["items"]),
            "taxes": [{"type": t, "label": codes.TAX_LABELS[t], "rate": codes.TAX_RATES[t],
                       "taxable": float(o["taxable"][t]), "tax": float(o["tax"][t])} for t in TAX_TYPES],
            "total_tax": float(sum(o["tax"].values(), Decimal("0.00"))),
            "by_payment": {k: float(v) for k, v in sorted(o["by_payment"].items())},
        }

    ns, nr = side(out["NS"]), side(out["NR"])
    return {
        "trade_name": cfg.taxpayer_name, "tin": cfg.tin, "branch": cfg.bhf_id,
        "mrc": cfg.mrc_no, "sdc_id": cfg.sdc_id, "cis": f"{codes.CIS_NAME} {codes.CIS_VERSION}",
        "from": start.astimezone(build.KIGALI).isoformat(), "to": end.astimezone(build.KIGALI).isoformat(),
        "sales": ns, "refunds": nr,
        "net_total": round(ns["total"] - nr["total"], 2),
        # §18.1.13 "number of items sold": what the sales receipts sold.
        "items_sold": ns["items"],
        "items_refunded": nr["items"],
        "opening_deposit": float(cash.get("deposit", {}).get("amount", 0)),
        "deposits": {"count": cash.get("deposit", {}).get("count", 0),
                     "amount": float(cash.get("deposit", {}).get("amount", 0))},
        "withdrawals": {"count": cash.get("withdrawal", {}).get("count", 0),
                        "amount": float(cash.get("withdrawal", {}).get("amount", 0))},
        "copies": {lbl: {"count": copy.get(lbl, {}).get("count", 0), "amount": float(copy.get(lbl, {}).get("amount", 0))}
                   for lbl in ("CS", "CR")},
        # Higoverse has no training mode, and its proformas are not EBM receipts.
        "training": {"count": 0, "amount": 0.0},
        "proforma": {"count": 0, "amount": 0.0},
        "discounts": 0.0,
        # Refunds are the registrations that reduce the day's sales.
        "reductions": nr["total"],
        "incomplete_sales": int(incomplete),
    }


def x_report(db: Session, cfg: EbmConfig) -> dict:
    """From the end of the last Z report (or the start) until now."""
    z = last_z(db, cfg.shop_id)
    start = z.period_to + timedelta(microseconds=1) if z else (cfg.initialized_at or EPOCH)
    data = summary(db, cfg, start, datetime.now(timezone.utc))
    return {"kind": "X", "number": (z.number + 1) if z else 1, **data}


def close_day(db: Session, cfg: EbmConfig, day, user: dict) -> EbmZReport:
    """The Z report for a day. Covers everything since the previous Z (§20),
    so a day without a Z is never lost. Numbered 1, 2, … per business."""
    prev = last_z(db, cfg.shop_id)
    start = prev.period_to + timedelta(microseconds=1) if prev else (cfg.initialized_at or EPOCH)
    _, end = day_bounds(day)
    if prev and end <= prev.period_to:
        raise ValueError("A Z report already covers that day.")
    if end.date() > datetime.now(build.KIGALI).date():
        raise ValueError("A Z report can't be made for a day that hasn't started.")
    number = (prev.number + 1) if prev else 1
    data = {"kind": "Z", "number": number, "day": day.isoformat(), **summary(db, cfg, start, end)}
    z = EbmZReport(shop_id=cfg.shop_id, number=number, day=day.isoformat(), period_from=start, period_to=end,
                   data=data, created_by=user.get("user_id"), created_by_name=user.get("name"))
    db.add(z)
    db.commit()
    db.refresh(z)
    return z


def plu(db: Session, cfg: EbmConfig, start: datetime, end: datetime, stock: dict[str, float | None]) -> dict:
    """Each item sold in the period (sales minus refunds) with its stock now.
    `stock` maps product id → remaining quantity (from product-service)."""
    invs = (db.query(EbmInvoice)
            .filter(EbmInvoice.shop_id == cfg.shop_id, EbmInvoice.status == "signed",
                    EbmInvoice.signed_at >= start, EbmInvoice.signed_at <= end).all())
    rows: dict[str, dict] = {}
    for inv in invs:
        sign = Decimal(-1) if inv.receipt_type == codes.RECEIPT_REFUND else Decimal(1)
        for it in (inv.request or {}).get("itemList") or []:
            r = rows.setdefault(it["itemCd"], {"item_code": it["itemCd"], "name": it.get("itemNm"),
                                               "unit_price": 0.0, "tax_type": it.get("taxTyCd"),
                                               "quantity": Decimal("0"), "amount": Decimal("0.00")})
            r["unit_price"] = float(it.get("prc") or 0)
            r["quantity"] += sign * Decimal(str(it.get("qty") or 0))
            r["amount"] += sign * _d(it.get("totAmt"))
    products = {i.item_code: i.product_id for i in db.query(EbmItem).filter(
        EbmItem.shop_id == cfg.shop_id, EbmItem.item_code.in_(list(rows) or [""])).all()}
    items = []
    for code, r in sorted(rows.items(), key=lambda kv: kv[1]["name"] or ""):
        items.append({**r, "tax_rate": codes.TAX_RATES.get(r["tax_type"], 0), "quantity": float(r["quantity"]),
                      "amount": float(r["amount"]), "remaining": stock.get(products.get(code, ""))})
    return {"kind": "PLU", "trade_name": cfg.taxpayer_name, "tin": cfg.tin, "cis": f"{codes.CIS_NAME} {codes.CIS_VERSION}",
            "from": start.astimezone(build.KIGALI).isoformat(), "to": end.astimezone(build.KIGALI).isoformat(),
            "items": items}


def closing_stock(db: Session, shop_id: str, day, current: dict[str, dict]) -> list[dict]:
    """Stock at the end of a day (§7.31): today's quantity, plus what was sold
    since, minus what was bought since. `current` maps product id → product.
    Quantities typed in by hand on a product aren't recorded anywhere, so
    such corrections made after that day aren't taken back."""
    _, end = day_bounds(day)
    sold = dict(db.query(Sale.product_id, func.coalesce(func.sum(Sale.quantity), 0))
                .filter(Sale.shop_id == shop_id, Sale.created_at > end).group_by(Sale.product_id).all())
    bought: dict[str, int] = {}
    try:
        # Purchases live in the same database (purchase-service's table).
        rows = db.execute(text("SELECT product_id, COALESCE(SUM(quantity_added), 0) FROM purchases "
                               "WHERE shop_id = :s AND created_at > :d AND product_id IS NOT NULL GROUP BY product_id"),
                          {"s": shop_id, "d": end}).all()
        bought = {pid: int(q) for pid, q in rows}
    except Exception:
        db.rollback()
    out = []
    for pid, p in current.items():
        qty = int(p.get("quantity") or 0) + int(sold.get(pid, 0)) - bought.get(pid, 0)
        out.append({"product_id": pid, "name": p.get("name"), "quantity": qty})
    return sorted(out, key=lambda r: r["name"] or "")
