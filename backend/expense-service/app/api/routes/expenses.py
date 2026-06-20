from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.expense import Expense, ExpenseCategory
from app.schemas.expense import ExpenseCreate, ExpenseUpdate
from app.core.security import get_current_user

router = APIRouter(prefix="/expenses", tags=["Expenses"])


# ─────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────

def _get_or_404(db: Session, expense_id: str, shop_id: str) -> Expense:
    e = db.query(Expense).filter(Expense.id == expense_id, Expense.shop_id == shop_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Expense not found")
    return e


def _fmt(e: Expense) -> dict:
    return {
        "id":           e.id,
        "shop_id":      e.shop_id,
        "created_by":   e.created_by,
        "title":        e.title,
        "category":     e.category,
        "amount":       float(e.amount),
        "notes":        e.notes,
        "expense_date": e.expense_date.isoformat() if e.expense_date else None,
        "created_at":   e.created_at.isoformat() if e.created_at else None,
    }


# ─────────────────────────────────────────
# LIST EXPENSES
# ─────────────────────────────────────────

@router.get("/")
def list_expenses(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    page: int = 1,
    limit: int = 25,
    category: ExpenseCategory | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
):
    q = db.query(Expense).filter(Expense.shop_id == user["shop_id"])

    if category:
        q = q.filter(Expense.category == category)
    if from_date:
        q = q.filter(Expense.expense_date >= datetime.fromisoformat(from_date + "T00:00:00"))
    if to_date:
        q = q.filter(Expense.expense_date <= datetime.fromisoformat(to_date + "T23:59:59"))

    q = q.order_by(Expense.expense_date.desc())
    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()

    return {
        "success": True,
        "data": {
            "items": [_fmt(e) for e in items],
            "total": total,
            "page": page,
            "limit": limit,
        },
    }


# ─────────────────────────────────────────
# SUMMARY (for report-service / profit calc)
# ─────────────────────────────────────────

@router.get("/summary")
def get_summary(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    from_date: str | None = None,
    to_date: str | None = None,
):
    q = db.query(Expense).filter(Expense.shop_id == user["shop_id"])
    if from_date:
        q = q.filter(Expense.expense_date >= datetime.fromisoformat(from_date + "T00:00:00"))
    if to_date:
        q = q.filter(Expense.expense_date <= datetime.fromisoformat(to_date + "T23:59:59"))

    row = q.with_entities(
        func.coalesce(func.sum(Expense.amount), 0).label("total_expenses"),
        func.count(Expense.id).label("count"),
    ).one()

    return {
        "success": True,
        "data": {
            "total_expenses": float(row.total_expenses),
            "count": int(row.count),
        },
    }


# ─────────────────────────────────────────
# BY CATEGORY (for charts / reports)
# ─────────────────────────────────────────

@router.get("/by-category")
def get_by_category(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    from_date: str | None = None,
    to_date: str | None = None,
):
    q = db.query(Expense).filter(Expense.shop_id == user["shop_id"])
    if from_date:
        q = q.filter(Expense.expense_date >= datetime.fromisoformat(from_date + "T00:00:00"))
    if to_date:
        q = q.filter(Expense.expense_date <= datetime.fromisoformat(to_date + "T23:59:59"))

    rows = q.with_entities(
        Expense.category,
        func.coalesce(func.sum(Expense.amount), 0).label("total"),
        func.count(Expense.id).label("count"),
    ).group_by(Expense.category).order_by(func.sum(Expense.amount).desc()).all()

    return {
        "success": True,
        "data": [
            {
                "category": r.category,
                "total": float(r.total),
                "count": int(r.count),
            }
            for r in rows
        ],
    }


# ─────────────────────────────────────────
# DAILY BREAKDOWN
# ─────────────────────────────────────────

@router.get("/daily")
def get_daily(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    days: int = 14,
):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    q = db.query(Expense).filter(
        Expense.shop_id == user["shop_id"],
        Expense.expense_date >= since,
    )

    rows = q.with_entities(
        func.date(Expense.expense_date).label("day"),
        func.coalesce(func.sum(Expense.amount), 0).label("total"),
        func.count(Expense.id).label("count"),
    ).group_by(func.date(Expense.expense_date)).order_by(func.date(Expense.expense_date)).all()

    return {
        "success": True,
        "data": [
            {
                "day": str(r.day),
                "total": float(r.total),
                "count": int(r.count),
            }
            for r in rows
        ],
    }


# ─────────────────────────────────────────
# CREATE EXPENSE
# ─────────────────────────────────────────

@router.post("/")
def create_expense(
    payload: ExpenseCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    expense = Expense(
        shop_id=user["shop_id"],
        created_by=user["user_id"],
        title=payload.title,
        category=payload.category,
        amount=payload.amount,
        notes=payload.notes,
        expense_date=payload.expense_date,
    )
    db.add(expense)
    db.commit()
    db.refresh(expense)

    return {"success": True, "message": "Expense recorded successfully", "data": _fmt(expense)}


# ─────────────────────────────────────────
# GET SINGLE EXPENSE
# ─────────────────────────────────────────

@router.get("/{expense_id}")
def get_expense(
    expense_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    return {"success": True, "data": _fmt(_get_or_404(db, expense_id, user["shop_id"]))}


# ─────────────────────────────────────────
# UPDATE EXPENSE
# ─────────────────────────────────────────

@router.put("/{expense_id}")
def update_expense(
    expense_id: str,
    payload: ExpenseUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    expense = _get_or_404(db, expense_id, user["shop_id"])

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(expense, key, value)

    db.commit()
    db.refresh(expense)

    return {"success": True, "message": "Expense updated", "data": _fmt(expense)}


# ─────────────────────────────────────────
# DELETE EXPENSE
# ─────────────────────────────────────────

@router.delete("/{expense_id}")
def delete_expense(
    expense_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    expense = _get_or_404(db, expense_id, user["shop_id"])
    db.delete(expense)
    db.commit()
    return {"success": True, "message": "Expense deleted"}
