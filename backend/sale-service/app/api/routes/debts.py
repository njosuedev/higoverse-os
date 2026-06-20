from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.debt import Debt
from app.schemas.debt import DebtCreate, DebtUpdate
from app.core.security import get_current_user

router = APIRouter(prefix="/debts", tags=["Debts"])


def _get_or_404(db: Session, debt_id: str, shop_id: str) -> Debt:
    d = db.query(Debt).filter(Debt.id == debt_id, Debt.shop_id == shop_id).first()
    if not d:
        raise HTTPException(status_code=404, detail="Debt not found")
    return d


def _fmt(d: Debt) -> dict:
    return {
        "id": d.id,
        "shop_id": d.shop_id,
        "sale_id": d.sale_id,
        "debtor_name": d.debtor_name,
        "phone": d.phone,
        "amount_owed": float(d.amount_owed),
        "amount_paid": float(d.amount_paid),
        "balance": float(d.amount_owed) - float(d.amount_paid),
        "notes": d.notes,
        "is_paid": d.is_paid,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


@router.get("")
def list_debts(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    is_paid: bool | None = None,
):
    q = db.query(Debt).filter(Debt.shop_id == user["shop_id"])
    if is_paid is not None:
        q = q.filter(Debt.is_paid == is_paid)
    q = q.order_by(Debt.created_at.desc())
    items = q.all()
    total_owed = sum(float(d.amount_owed) - float(d.amount_paid) for d in items if not d.is_paid)
    return {
        "success": True,
        "data": {
            "items": [_fmt(d) for d in items],
            "total": len(items),
            "total_outstanding": total_owed,
        },
    }


@router.post("")
def create_debt(
    payload: DebtCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    debt = Debt(
        shop_id=user["shop_id"],
        sale_id=payload.sale_id,
        debtor_name=payload.debtor_name,
        phone=payload.phone,
        amount_owed=payload.amount_owed,
        amount_paid=payload.amount_paid,
        notes=payload.notes,
        is_paid=float(payload.amount_paid) >= float(payload.amount_owed),
    )
    db.add(debt)
    db.commit()
    db.refresh(debt)
    return {"success": True, "message": "Debt recorded", "data": _fmt(debt)}


@router.get("/{debt_id}")
def get_debt(
    debt_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    return {"success": True, "data": _fmt(_get_or_404(db, debt_id, user["shop_id"]))}


@router.put("/{debt_id}")
def update_debt(
    debt_id: str,
    payload: DebtUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    debt = _get_or_404(db, debt_id, user["shop_id"])
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(debt, key, value)
    owed = float(debt.amount_owed)
    paid = float(debt.amount_paid)
    if paid >= owed:
        debt.is_paid = True
    db.commit()
    db.refresh(debt)
    return {"success": True, "message": "Debt updated", "data": _fmt(debt)}


@router.delete("/{debt_id}")
def delete_debt(
    debt_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    debt = _get_or_404(db, debt_id, user["shop_id"])
    db.delete(debt)
    db.commit()
    return {"success": True, "message": "Debt deleted"}
