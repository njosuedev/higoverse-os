"""Income: money earned outside sales (models/income.py).

GET    /incomes               list (page, limit, source, from_date, to_date)
GET    /incomes/summary       total and count; also what Expenses holds as
                              "money received" (direction "in"), so the
                              Income page and profit can count it
GET    /incomes/by-source
POST   /incomes
PUT    /incomes/{id}
DELETE /incomes/{id}
"""
from datetime import datetime
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import require_expense_access, require_expense_totals
from app.db.database import get_db
from app.models.expense import Expense
from app.models.income import INCOME_SOURCES, Income

router = APIRouter(prefix="/incomes", tags=["Income"])

Source = Literal["rental", "services", "commission", "transport", "interest", "other"]
Method = Literal["cash", "mtn", "bank"]


def _clean(v: str | None) -> str | None:
    v = " ".join((v or "").split())
    return v or None


class IncomeIn(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    source: Source = "other"
    amount: Decimal = Field(..., gt=0, le=Decimal("100000000000"))
    income_date: datetime
    payment_method: Method | None = None
    payer: str | None = Field(None, max_length=150)
    reference: str | None = Field(None, max_length=100)
    notes: str | None = Field(None, max_length=2000)

    @field_validator("title", "payer", "reference", "notes")
    @classmethod
    def tidy(cls, v: str | None) -> str | None:
        return _clean(v)


class IncomeUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    source: Source | None = None
    amount: Decimal | None = Field(None, gt=0, le=Decimal("100000000000"))
    income_date: datetime | None = None
    payment_method: Method | None = None
    payer: str | None = Field(None, max_length=150)
    reference: str | None = Field(None, max_length=100)
    notes: str | None = Field(None, max_length=2000)

    @field_validator("title", "payer", "reference", "notes")
    @classmethod
    def tidy(cls, v: str | None) -> str | None:
        return _clean(v)


def _fmt(i: Income) -> dict:
    return {
        "id": i.id,
        "title": i.title,
        "source": i.source if i.source in INCOME_SOURCES else "other",
        "amount": float(i.amount),
        "income_date": i.income_date.isoformat() if i.income_date else None,
        "payment_method": i.payment_method,
        "payer": i.payer,
        "reference": i.reference,
        "notes": i.notes,
        "created_at": i.created_at.isoformat() if i.created_at else None,
    }


def _period(q, col, from_date: str | None, to_date: str | None):
    try:
        if from_date:
            q = q.filter(col >= datetime.fromisoformat(from_date + "T00:00:00"))
        if to_date:
            q = q.filter(col <= datetime.fromisoformat(to_date + "T23:59:59"))
    except ValueError:
        raise HTTPException(status_code=422, detail="Dates must be YYYY-MM-DD")
    return q


def _get(db: Session, income_id: str, shop: str) -> Income:
    i = db.query(Income).filter(Income.id == income_id, Income.shop_id == shop).first()
    if not i:
        raise HTTPException(status_code=404, detail="Income not found")
    return i


@router.get("")
def list_incomes(
    page: int = 1,
    limit: int = 50,
    source: Source | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    db: Session = Depends(get_db),
    user: dict = Depends(require_expense_access),
):
    limit = max(1, min(limit, 1000))
    if not user["shop_id"]:
        return {"success": True, "data": {"items": [], "total": 0, "page": page, "limit": limit}}
    q = db.query(Income).filter(Income.shop_id == user["shop_id"])
    if source:
        q = q.filter(Income.source == source)
    q = _period(q, Income.income_date, from_date, to_date).order_by(Income.income_date.desc(), Income.created_at.desc())
    total = q.count()
    items = q.offset((max(page, 1) - 1) * limit).limit(limit).all()
    return {"success": True, "data": {"items": [_fmt(i) for i in items], "total": total, "page": page, "limit": limit}}


@router.get("/summary")
def income_summary(
    from_date: str | None = None,
    to_date: str | None = None,
    db: Session = Depends(get_db),
    user: dict = Depends(require_expense_totals),
):
    empty = {"total_income": 0.0, "count": 0, "from_expenses": 0.0, "from_expenses_count": 0}
    if not user["shop_id"]:
        return {"success": True, "data": empty}
    q = _period(db.query(Income).filter(Income.shop_id == user["shop_id"]), Income.income_date, from_date, to_date)
    row = q.with_entities(func.coalesce(func.sum(Income.amount), 0), func.count(Income.id)).one()
    e = _period(db.query(Expense).filter(Expense.shop_id == user["shop_id"], Expense.direction == "in"),
                Expense.expense_date, from_date, to_date)
    erow = e.with_entities(func.coalesce(func.sum(Expense.amount), 0), func.count(Expense.id)).one()
    return {"success": True, "data": {
        # Recorded here plus "money received" kept in Expenses.
        "total_income": float(row[0]) + float(erow[0]),
        "count": int(row[1]),
        "from_expenses": float(erow[0]),
        "from_expenses_count": int(erow[1]),
    }}


@router.get("/by-source")
def income_by_source(
    from_date: str | None = None,
    to_date: str | None = None,
    db: Session = Depends(get_db),
    user: dict = Depends(require_expense_totals),
):
    if not user["shop_id"]:
        return {"success": True, "data": []}
    q = _period(db.query(Income).filter(Income.shop_id == user["shop_id"]), Income.income_date, from_date, to_date)
    rows = (q.with_entities(Income.source, func.sum(Income.amount).label("total"), func.count(Income.id).label("count"))
            .group_by(Income.source).order_by(func.sum(Income.amount).desc()).all())
    return {"success": True, "data": [{"source": r.source, "total": float(r.total), "count": int(r.count)} for r in rows]}


@router.post("")
def create_income(payload: IncomeIn, db: Session = Depends(get_db), user: dict = Depends(require_expense_access)):
    if not user["shop_id"]:
        raise HTTPException(status_code=400, detail="You need a business before recording income")
    i = Income(shop_id=user["shop_id"], created_by=str(user["user_id"]), **payload.model_dump())
    db.add(i)
    db.commit()
    db.refresh(i)
    return {"success": True, "message": "Income recorded", "data": _fmt(i)}


@router.put("/{income_id}")
def update_income(income_id: str, payload: IncomeUpdate, db: Session = Depends(get_db), user: dict = Depends(require_expense_access)):
    i = _get(db, income_id, user["shop_id"])
    data = payload.model_dump(exclude_unset=True)
    for k in ("title", "amount", "income_date", "source"):
        if k in data and data[k] is None:
            raise HTTPException(status_code=422, detail=f"{k} can't be empty")
    for k, v in data.items():
        setattr(i, k, v)
    db.commit()
    db.refresh(i)
    return {"success": True, "data": _fmt(i)}


@router.delete("/{income_id}")
def delete_income(income_id: str, db: Session = Depends(get_db), user: dict = Depends(require_expense_access)):
    i = _get(db, income_id, user["shop_id"])
    db.delete(i)
    db.commit()
    return {"success": True, "message": "Income deleted"}
