import json
from datetime import datetime, timezone

from sqlalchemy import or_
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.debt import Debt
from app.models.proforma import Proforma
from app.models.sale import Sale
from app.schemas.proforma import ProformaCreate, ProformaUpdate, ProformaSell
from app.core.security import get_current_user
from app.core.product_client import get_product, update_product_stock
from app.core.events import emit
from app.api.routes.sales import _live as _live_sale
from app.api.routes.debts import _live as _live_debt

router = APIRouter(prefix="/proforma", tags=["Proforma"])

# A proforma lists the vehicles and the customer's details. Staff prepare it
# (draft); one of these roles approves it; once the customer decides to buy,
# the approved proforma becomes sales (sold).
APPROVER_ROLES = {"owner", "admin", "manager"}

# Statuses that may still be approved ("sent" is a draft that was shared).
_APPROVABLE = {"draft", "sent"}
# Already approved ("accepted" is the old name, from before /approve).
_APPROVED = {"approved", "accepted"}

# What changes the proforma's content; editing any of it after approval
# sends it back to draft so it is approved again as it now reads.
_CONTENT_KEYS = {
    "customer_id", "customer", "customer_phone", "customer_address", "customer_id_no",
    "customer_tin", "customer_email", "customer_country", "customer_company",
    "lines", "subtotal", "tax_rate", "tax_amount", "grand_total", "currency",
    "payment_method", "bank_details", "deposit_amount", "terms", "valid_until",
}


def _is_approver(user: dict) -> bool:
    return user.get("role") in APPROVER_ROLES


def _get_or_404(db: Session, proforma_id: str, shop_id: str) -> Proforma:
    p = db.query(Proforma).filter(Proforma.id == proforma_id, Proforma.shop_id == shop_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proforma not found")
    return p


def _num(v) -> float:
    return float(v) if v is not None else 0.0


def _fmt(p: Proforma) -> dict:
    return {
        "id": p.id,
        "invoice_no": p.invoice_no,
        "date": p.date,
        "valid_until": p.valid_until,
        "salesperson": p.salesperson or "",
        "customer_id": p.customer_id,
        "customer": p.customer or "",
        "customer_phone": p.customer_phone or "",
        "customer_address": p.customer_address or "",
        "customer_id_no": p.customer_id_no or "",
        "customer_tin": p.customer_tin or "",
        "customer_email": p.customer_email or "",
        "customer_country": p.customer_country or "",
        "customer_company": p.customer_company or "",
        "notes": p.notes or "",
        "lines": p.lines or [],
        "subtotal": _num(p.subtotal),
        "tax_rate": _num(p.tax_rate),
        "tax_amount": _num(p.tax_amount),
        "grand_total": _num(p.grand_total),
        "currency": p.currency,
        "payment_method": p.payment_method or "",
        "bank_details": p.bank_details or "",
        "deposit_amount": _num(p.deposit_amount),
        "terms": p.terms or "",
        "status": p.status,
        "approved_by": p.approved_by or "",
        "approved_at": p.approved_at.isoformat() if p.approved_at else None,
        "sold_at": p.sold_at.isoformat() if p.sold_at else None,
        "sale_ids": p.sale_ids or [],
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


def _norm(key: str, v):
    """A value in a form that compares equal however it was stored (numbers
    come back from the database as Decimal, lines' prices as text)."""
    if key == "lines":
        out = []
        for l in v or []:
            d = {k: x for k, x in dict(l).items() if x not in (None, "")}
            for k in ("qty", "unit_price"):
                d[k] = float(d.get(k) or 0)
            out.append(d)
        return out
    if key in ("subtotal", "tax_rate", "tax_amount", "grand_total", "deposit_amount"):
        return float(v or 0)
    return v or None


def _token(authorization: str | None) -> str:
    return authorization.replace("Bearer ", "") if authorization else ""


def _approve(p: Proforma, user: dict) -> None:
    if not _is_approver(user):
        raise HTTPException(status_code=403, detail="Only the owner or a manager can approve a proforma.")
    if p.status not in _APPROVABLE:
        raise HTTPException(status_code=409, detail=f"A {p.status} proforma can't be approved.")
    if not (p.customer or "").strip():
        raise HTTPException(status_code=400, detail="Add the customer's name before approving.")
    if not p.lines:
        raise HTTPException(status_code=400, detail="Add at least one vehicle or item before approving.")
    p.status = "approved"
    p.approved_by = user.get("name") or user.get("email") or ""
    p.approved_at = datetime.now(timezone.utc)


@router.get("")
def list_proforma(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    search: str | None = None,
    status: str | None = None,
    page: int = 1,
    limit: int = 100,
):
    if not user["shop_id"]:
        return {"success": True, "data": {"items": [], "total": 0, "page": page, "limit": limit}}

    q = db.query(Proforma).filter(Proforma.shop_id == user["shop_id"])
    if status:
        q = q.filter(Proforma.status.in_(_APPROVED if status == "approved" else {status}))
    if search:
        like = f"%{search}%"
        q = q.filter(or_(
            Proforma.invoice_no.ilike(like),
            Proforma.customer.ilike(like),
            Proforma.customer_phone.ilike(like),
            Proforma.status.ilike(like),
        ))
    q = q.order_by(Proforma.created_at.desc())

    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()

    return {
        "success": True,
        "data": {
            "items": [_fmt(p) for p in items],
            "total": total,
            "page": page,
            "limit": limit,
        },
    }


@router.post("")
def create_proforma(
    payload: ProformaCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    if not user["shop_id"]:
        raise HTTPException(status_code=400, detail="You need a shop before creating proformas")

    data = payload.model_dump(mode="json")
    # Every proforma starts unapproved; approval is its own step.
    data["status"] = data["status"] if data["status"] in ("draft", "sent") else "draft"
    proforma = Proforma(shop_id=user["shop_id"], **data)
    db.add(proforma)
    db.commit()
    db.refresh(proforma)
    return {"success": True, "message": "Proforma created", "data": _fmt(proforma)}


@router.get("/{proforma_id}")
def get_proforma(
    proforma_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    return {"success": True, "data": _fmt(_get_or_404(db, proforma_id, user["shop_id"]))}


@router.put("/{proforma_id}")
def update_proforma(
    proforma_id: str,
    payload: ProformaUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    proforma = _get_or_404(db, proforma_id, user["shop_id"])
    if proforma.status == "sold":
        raise HTTPException(status_code=409, detail="This proforma is already sold and can't be changed.")

    updates = payload.model_dump(exclude_unset=True, mode="json")
    status = updates.pop("status", None)

    changed = {k for k, v in updates.items() if _norm(k, getattr(proforma, k)) != _norm(k, v)}
    for key, value in updates.items():
        setattr(proforma, key, value)

    if status == "accepted":
        # Older phone apps mark a proforma "accepted": that is approving it.
        if proforma.status not in _APPROVED:
            _approve(proforma, user)
    elif status:
        proforma.status = status
        if status == "draft":
            proforma.approved_by = None
            proforma.approved_at = None
    if proforma.status in _APPROVED and changed & _CONTENT_KEYS:
        proforma.status = "draft"
        proforma.approved_by = None
        proforma.approved_at = None

    db.commit()
    db.refresh(proforma)
    return {"success": True, "message": "Proforma updated", "data": _fmt(proforma)}


@router.post("/{proforma_id}/approve")
def approve_proforma(
    proforma_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    proforma = _get_or_404(db, proforma_id, user["shop_id"])
    _approve(proforma, user)
    db.commit()
    db.refresh(proforma)
    return {"success": True, "message": "Proforma approved", "data": _fmt(proforma)}


@router.post("/{proforma_id}/sell")
def sell_proforma(
    proforma_id: str,
    payload: ProformaSell,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    authorization: str = Header(None),
):
    """The customer decided to buy: record one sale per line, take the
    vehicles out of stock, and mark the proforma sold."""
    proforma = _get_or_404(db, proforma_id, user["shop_id"])
    if proforma.status == "sold":
        raise HTTPException(status_code=409, detail="This proforma is already sold.")
    if proforma.status not in _APPROVED:
        raise HTTPException(status_code=409, detail="Approve the proforma before recording the sale.")

    customer_id = (payload.customer_id or proforma.customer_id or "").strip() or None
    if user.get("layout") == "car" and not customer_id:
        raise HTTPException(status_code=400, detail="Choose the customer buying this car.")

    lines = proforma.lines or []
    if not lines:
        raise HTTPException(status_code=400, detail="This proforma has nothing to sell.")
    typed = [l.get("product_name") or "?" for l in lines if not l.get("product_id")]
    if typed:
        raise HTTPException(
            status_code=400,
            detail="Pick these from stock before selling: " + ", ".join(typed),
        )

    token = _token(authorization)

    # Check every line first, so nothing is taken out of stock unless all of
    # it can be sold.
    wanted: dict[str, int] = {}
    for l in lines:
        qty = int(round(float(l.get("qty") or 0)))
        if qty <= 0:
            raise HTTPException(status_code=400, detail=f"Quantity for {l.get('product_name')} must be at least 1.")
        wanted[l["product_id"]] = wanted.get(l["product_id"], 0) + qty
    products: dict[str, dict] = {}
    for pid, qty in wanted.items():
        product = get_product(pid, token)
        if not product:
            raise HTTPException(status_code=404, detail="A vehicle on this proforma is no longer in stock.")
        if product["quantity"] < qty:
            raise HTTPException(
                status_code=400,
                detail=f"{product.get('name')} is no longer in stock (available: {product['quantity']}).",
            )
        # A car booked (pending) for another buyer isn't for sale to this one.
        try:
            attrs = json.loads(product.get("attributes") or "{}")
        except (TypeError, ValueError):
            attrs = {}
        if attrs.get("sale_status") == "pending" and attrs.get("buyer_customer_id") != customer_id:
            who = attrs.get("buyer_name") or "another customer"
            raise HTTPException(status_code=409, detail=f"{product.get('name')} is booked for {who}.")
        products[pid] = product

    # Take everything out of stock; put it back if any update fails.
    done: list[str] = []
    for pid, qty in wanted.items():
        if not update_product_stock(pid, products[pid]["quantity"] - qty, products[pid], token):
            for back in done:
                update_product_stock(back, products[back]["quantity"], products[back], token)
            raise HTTPException(status_code=503, detail="Could not update stock. Nothing was sold.")
        done.append(pid)

    grand_total = sum(float(l.get("unit_price") or 0) * int(round(float(l.get("qty") or 0))) for l in lines)
    on_credit = payload.payment_method == "debt"
    # What the customer pays now; the rest (if any) is owed.
    if payload.amount_paid is not None:
        paid_now = min(float(payload.amount_paid), grand_total)
    else:
        paid_now = 0.0 if on_credit else grand_total
    track_paid = payload.amount_paid is not None or on_credit
    left = paid_now
    note = f"Proforma {proforma.invoice_no}"

    sales: list[Sale] = []
    for l in lines:
        product = products[l["product_id"]]
        qty = int(round(float(l.get("qty") or 0)))
        price = float(l.get("unit_price") or 0)
        cost = float(product.get("cost_price") or 0)
        total = price * qty
        paid = None
        if track_paid:
            paid = min(total, left)
            left -= paid
        sale = Sale(
            shop_id=user["shop_id"],
            product_id=l["product_id"],
            product_name=product.get("name"),
            customer_id=customer_id,
            quantity=qty,
            unit_price=price,
            cost_at_sale=cost,
            total_amount=total,
            profit=(price - cost) * qty,
            notes=note,
            payment_method=payload.payment_method,
            amount_paid=paid,
        )
        db.add(sale)
        sales.append(sale)
    db.flush()
    for sale in sales:
        emit(db, user, "sale.created", _live_sale(sale))

    # Not paid in full: the balance is owed, like a sale recorded on credit.
    if paid_now < grand_total:
        debt = Debt(
            shop_id=user["shop_id"],
            sale_id=sales[0].id,
            debtor_name=proforma.customer or "Customer",
            phone=proforma.customer_phone or None,
            amount_owed=grand_total,
            amount_paid=paid_now,
            notes=note,
            is_paid=False,
        )
        db.add(debt)
        db.flush()
        emit(db, user, "debt.created", _live_debt(debt))

    proforma.status = "sold"
    proforma.sold_at = datetime.now(timezone.utc)
    proforma.sale_ids = [s.id for s in sales]
    if customer_id:
        proforma.customer_id = customer_id
    db.commit()
    db.refresh(proforma)
    return {"success": True, "message": "Sale recorded", "data": _fmt(proforma)}


@router.delete("/{proforma_id}")
def delete_proforma(
    proforma_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    proforma = _get_or_404(db, proforma_id, user["shop_id"])
    if proforma.status == "sold":
        raise HTTPException(status_code=409, detail="A sold proforma is kept with its sales and can't be deleted.")
    db.delete(proforma)
    db.commit()
    return {"success": True, "message": "Proforma deleted"}
