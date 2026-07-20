from sqlalchemy import or_
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.proforma import Proforma
from app.schemas.proforma import ProformaCreate, ProformaUpdate
from app.core.security import get_current_user

router = APIRouter(prefix="/proforma", tags=["Proforma"])


def _get_or_404(db: Session, proforma_id: str, shop_id: str) -> Proforma:
    p = db.query(Proforma).filter(Proforma.id == proforma_id, Proforma.shop_id == shop_id).first()
    if not p:
        raise HTTPException(status_code=404, detail="Proforma not found")
    return p


def _fmt(p: Proforma) -> dict:
    return {
        "id": p.id,
        "invoice_no": p.invoice_no,
        "date": p.date,
        "valid_until": p.valid_until,
        "customer": p.customer or "",
        "customer_phone": p.customer_phone or "",
        "customer_address": p.customer_address or "",
        "notes": p.notes or "",
        "lines": p.lines or [],
        "subtotal": float(p.subtotal),
        "tax_rate": float(p.tax_rate),
        "tax_amount": float(p.tax_amount),
        "grand_total": float(p.grand_total),
        "currency": p.currency,
        "status": p.status,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


@router.get("")
def list_proforma(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    search: str | None = None,
    page: int = 1,
    limit: int = 100,
):
    if not user["shop_id"]:
        return {"success": True, "data": {"items": [], "total": 0, "page": page, "limit": limit}}

    q = db.query(Proforma).filter(Proforma.shop_id == user["shop_id"])
    if search:
        like = f"%{search}%"
        q = q.filter(or_(
            Proforma.invoice_no.ilike(like),
            Proforma.customer.ilike(like),
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

    proforma = Proforma(
        shop_id=user["shop_id"],
        invoice_no=payload.invoice_no,
        date=payload.date,
        valid_until=payload.valid_until,
        customer=payload.customer,
        customer_phone=payload.customer_phone,
        customer_address=payload.customer_address,
        notes=payload.notes,
        lines=[line.model_dump(mode="json") for line in payload.lines],
        subtotal=payload.subtotal,
        tax_rate=payload.tax_rate,
        tax_amount=payload.tax_amount,
        grand_total=payload.grand_total,
        currency=payload.currency,
        status=payload.status,
    )
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
    updates = payload.model_dump(exclude_unset=True, mode="json")
    for key, value in updates.items():
        setattr(proforma, key, value)
    db.commit()
    db.refresh(proforma)
    return {"success": True, "message": "Proforma updated", "data": _fmt(proforma)}


@router.delete("/{proforma_id}")
def delete_proforma(
    proforma_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    proforma = _get_or_404(db, proforma_id, user["shop_id"])
    db.delete(proforma)
    db.commit()
    return {"success": True, "message": "Proforma deleted"}
