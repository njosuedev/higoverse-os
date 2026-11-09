"""Income: money earned outside sales (models/income.py).

GET    /incomes               list (page, limit, source, from_date, to_date)
GET    /incomes/summary       total and count; also what Expenses holds as
                              "money received" (direction "in"), so the
                              Income page and profit can count it
GET    /incomes/by-source
POST   /incomes
PUT    /incomes/{id}
DELETE /incomes/{id}
GET    /incomes/{id}/proof

Correcting the type of a record entered on the wrong side (owner, admin or
accountant only, with a reason):
POST   /incomes/from-expense/{expense_id}   an expense that was really income
POST   /incomes/{id}/to-expense            income that was really an expense
GET    /incomes/corrections                the history of corrections
Each moves the record in one transaction: the new one is made with the same
title, amount, date, payment and receipts, the old one removed, and the
correction written to transaction_corrections with the old record as it was,
who did it, when and why. So it is never counted twice; every total, report
and dashboard is computed from the records. Corrections are never changed or
deleted (models/correction.py).
"""
import json

from datetime import datetime
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import require_expense_access, require_expense_totals
from app.db.database import get_db
from app.models.expense import Expense, ExpenseCategory
from app.models.correction import TransactionCorrection
from app.models.income import INCOME_SOURCES, Income

router = APIRouter(prefix="/incomes", tags=["Income"])

Source = Literal["rental", "services", "commission", "transport", "interest", "other"]
# Abroad (before the goods reach Rwanda) or in Rwanda; older rows = Rwanda.
Scope = Literal["rwanda", "abroad"]
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
    scope: Scope = "rwanda"

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
    scope: Scope | None = None

    @field_validator("title", "payer", "reference", "notes")
    @classmethod
    def tidy(cls, v: str | None) -> str | None:
        return _clean(v)


def _abroad(scope: str | None) -> str | None:
    """Stored as "abroad" or empty (Rwanda), like Expense.scope."""
    return "abroad" if scope == "abroad" else None


def _in_scope(q, scope: str | None):
    if not scope:
        return q
    if scope == "abroad":
        return q.filter(Income.scope == "abroad")
    return q.filter((Income.scope.is_(None)) | (Income.scope != "abroad"))


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
        "has_proof": bool(i.proof_data),
        "scope": "abroad" if i.scope == "abroad" else "rwanda",
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
    scope: Scope | None = None,
    db: Session = Depends(get_db),
    user: dict = Depends(require_expense_access),
):
    limit = max(1, min(limit, 1000))
    if not user["shop_id"]:
        return {"success": True, "data": {"items": [], "total": 0, "page": page, "limit": limit}}
    q = db.query(Income).filter(Income.shop_id == user["shop_id"])
    if source:
        q = q.filter(Income.source == source)
    q = _in_scope(q, scope)
    q = _period(q, Income.income_date, from_date, to_date).order_by(Income.income_date.desc(), Income.created_at.desc())
    total = q.count()
    items = q.offset((max(page, 1) - 1) * limit).limit(limit).all()
    moved = {c.new_id for c in db.query(TransactionCorrection.new_id).filter(
        TransactionCorrection.shop_id == user["shop_id"], TransactionCorrection.new_id.in_([i.id for i in items]))} if items else set()
    return {"success": True, "data": {
        "items": [{**_fmt(i), "corrected": i.id in moved} for i in items], "total": total, "page": page, "limit": limit}}


@router.get("/summary")
def income_summary(
    from_date: str | None = None,
    to_date: str | None = None,
    db: Session = Depends(get_db),
    user: dict = Depends(require_expense_totals),
):
    empty = {"total_income": 0.0, "count": 0, "from_expenses": 0.0, "from_expenses_count": 0, "abroad": 0.0, "rwanda": 0.0}
    if not user["shop_id"]:
        return {"success": True, "data": empty}
    q = _period(db.query(Income).filter(Income.shop_id == user["shop_id"]), Income.income_date, from_date, to_date)
    row = q.with_entities(func.coalesce(func.sum(Income.amount), 0), func.count(Income.id)).one()
    abroad = _in_scope(q, "abroad").with_entities(func.coalesce(func.sum(Income.amount), 0)).scalar() or 0
    e = _period(db.query(Expense).filter(Expense.shop_id == user["shop_id"], Expense.direction == "in"),
                Expense.expense_date, from_date, to_date)
    erow = e.with_entities(func.coalesce(func.sum(Expense.amount), 0), func.count(Expense.id)).one()
    return {"success": True, "data": {
        # Recorded here plus "money received" kept in Expenses.
        "total_income": float(row[0]) + float(erow[0]),
        "count": int(row[1]),
        "from_expenses": float(erow[0]),
        "from_expenses_count": int(erow[1]),
        # Recorded here, in two parts (money received kept in Expenses counts as Rwanda).
        "abroad": float(abroad),
        "rwanda": float(row[0]) - float(abroad),
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
    data = payload.model_dump()
    data["scope"] = _abroad(data.get("scope"))
    i = Income(shop_id=user["shop_id"], created_by=str(user["user_id"]), **data)
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
    if "scope" in data:
        data["scope"] = _abroad(data["scope"])
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


@router.get("/{income_id}/proof")
def income_proof(income_id: str, db: Session = Depends(get_db), user: dict = Depends(require_expense_access)):
    i = _get(db, income_id, user["shop_id"])
    try:
        files = json.loads(i.proof_data) if i.proof_data else []
    except ValueError:
        files = []
    return {"success": True, "data": {"files": files}}


# ── Correcting the type ────────────────────────────────────────────────────

# Who may move a record between Expenses and Income: the owner, admins and
# the accountant (managers keep the books but can't reclassify them).
CORRECTION_ROLES = {"owner", "admin", "accountant"}


def require_correction(user: dict = Depends(require_expense_access)) -> dict:
    if user.get("role") not in CORRECTION_ROLES:
        raise HTTPException(status_code=403, detail="Only the owner, an admin or the accountant can correct a record's type.")
    return user


class Reason(BaseModel):
    reason: str = Field(..., max_length=1000)

    @field_validator("reason")
    @classmethod
    def enough(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 5:
            raise ValueError("Say why the record is being corrected (at least 5 characters)")
        return v


class ToIncome(Reason):
    source: Source = "other"


class ToExpense(Reason):
    category: ExpenseCategory = ExpenseCategory.other
    # Expenses are paid by MTN or bank; income received in cash needs one.
    payment_method: Literal["mtn", "bank"] | None = None


def _join(*parts: str | None) -> str | None:
    text = "\n".join(p for p in parts if p)
    return text[:2000] or None


def _iso(d):
    return d.isoformat() if d else None


def _snapshot_expense(e: Expense) -> str:
    return json.dumps({
        "id": e.id, "title": e.title, "category": getattr(e.category, "value", e.category), "amount": str(e.amount),
        "expense_date": _iso(e.expense_date), "payment_method": e.payment_method, "bank_name": e.bank_name,
        "bank_account": e.bank_account, "receiver_phone": e.receiver_phone, "notes": e.notes,
        "direction": e.direction, "scope": e.scope or "rwanda", "has_proof": bool(e.proof_data), "created_by": e.created_by, "created_at": _iso(e.created_at),
    })


def _snapshot_income(i: Income) -> str:
    return json.dumps({
        "id": i.id, "title": i.title, "source": i.source, "amount": str(i.amount), "income_date": _iso(i.income_date),
        "payment_method": i.payment_method, "payer": i.payer, "reference": i.reference, "notes": i.notes,
        "has_proof": bool(i.proof_data), "scope": i.scope or "rwanda", "created_by": i.created_by, "created_at": _iso(i.created_at),
    })


def _log(db: Session, user: dict, **kw) -> TransactionCorrection:
    c = TransactionCorrection(
        shop_id=user["shop_id"], corrected_by=str(user["user_id"]),
        corrected_by_name=(user.get("name") or user.get("email") or "")[:150] or None,
        corrected_by_role=user.get("role"), **kw,
    )
    db.add(c)
    return c


def _fmt_correction(c: TransactionCorrection) -> dict:
    return {
        "id": c.id, "from_type": c.from_type, "to_type": c.to_type,
        "original_id": c.original_id, "new_id": c.new_id,
        "from_category": c.from_category, "to_category": c.to_category,
        "title": c.title, "amount": float(c.amount), "transaction_date": _iso(c.transaction_date),
        "reason": c.reason, "corrected_by": c.corrected_by, "corrected_by_name": c.corrected_by_name,
        "corrected_by_role": c.corrected_by_role, "corrected_at": _iso(c.corrected_at),
        "original": json.loads(c.original or "{}"),
    }


@router.get("/corrections")
def list_corrections(
    record_id: str | None = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    user: dict = Depends(require_expense_access),
):
    """Every correction of this business, newest first (or those of one record)."""
    if not user["shop_id"]:
        return {"success": True, "data": []}
    q = db.query(TransactionCorrection).filter(TransactionCorrection.shop_id == user["shop_id"])
    if record_id:
        q = q.filter((TransactionCorrection.original_id == record_id) | (TransactionCorrection.new_id == record_id))
    rows = q.order_by(TransactionCorrection.corrected_at.desc()).limit(max(1, min(limit, 1000))).all()
    return {"success": True, "data": [_fmt_correction(c) for c in rows]}


@router.post("/from-expense/{expense_id}")
def expense_to_income(expense_id: str, payload: ToIncome, db: Session = Depends(get_db), user: dict = Depends(require_correction)):
    """An expense that was really money received becomes income."""
    e = db.query(Expense).filter(Expense.id == expense_id, Expense.shop_id == user["shop_id"]).first()
    if not e:
        raise HTTPException(status_code=404, detail="Expense not found")
    i = Income(
        shop_id=e.shop_id, created_by=e.created_by, title=e.title[:200], source=payload.source,
        amount=e.amount, income_date=e.expense_date,
        payment_method=e.payment_method if e.payment_method in ("cash", "mtn", "bank") else None,
        reference=(e.bank_account or None) and e.bank_account[:100],
        notes=_join(e.notes, f"Bank: {e.bank_name}" if e.bank_name else None,
                    f"Phone: {e.receiver_phone}" if e.receiver_phone else None),
        proof_data=e.proof_data, scope=e.scope,
    )
    db.add(i)
    db.flush()
    _log(db, user, from_type="expense", to_type="income", original_id=e.id, new_id=i.id,
         from_category=getattr(e.category, "value", e.category), to_category=payload.source,
         title=e.title[:200], amount=e.amount, transaction_date=e.expense_date,
         original=_snapshot_expense(e), reason=payload.reason)
    db.delete(e)
    db.commit()
    db.refresh(i)
    return {"success": True, "message": "Moved to Income", "data": _fmt(i)}


@router.post("/{income_id}/to-expense")
def income_to_expense(income_id: str, payload: ToExpense, db: Session = Depends(get_db), user: dict = Depends(require_correction)):
    """Income that was really money spent becomes an expense."""
    i = _get(db, income_id, user["shop_id"])
    method = payload.payment_method or (i.payment_method if i.payment_method in ("mtn", "bank") else None)
    if not method:
        raise HTTPException(status_code=422, detail="Choose how the expense was paid: MTN or bank.")
    e = Expense(
        shop_id=i.shop_id, created_by=i.created_by, title=i.title, category=payload.category,
        amount=i.amount, expense_date=i.income_date, payment_method=method,
        bank_account=i.reference if method == "bank" else None,
        notes=_join(i.notes, f"Paid by: {i.payer}" if i.payer else None,
                    f"Ref: {i.reference}" if i.reference and method != "bank" else None),
        proof_data=i.proof_data, scope=i.scope,
    )
    db.add(e)
    db.flush()
    _log(db, user, from_type="income", to_type="expense", original_id=i.id, new_id=e.id,
         from_category=i.source, to_category=payload.category.value,
         title=i.title, amount=i.amount, transaction_date=i.income_date,
         original=_snapshot_income(i), reason=payload.reason)
    db.delete(i)
    db.commit()
    db.refresh(e)
    return {"success": True, "message": "Moved to Expenses", "data": {"id": e.id, "title": e.title, "amount": float(e.amount)}}
