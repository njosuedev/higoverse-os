import base64
import json
from datetime import datetime, timedelta, timezone
from typing import List
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.expense import Expense, ExpenseCategory
from app.schemas.expense import ExpenseCreate, ExpenseUpdate
from app.core.security import require_financial_access
from app.core.events import emit

router = APIRouter(prefix="/expenses", tags=["Expenses"])


# ─────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────

def _get_or_404(db: Session, expense_id: str, shop_id: str) -> Expense:
    e = db.query(Expense).filter(Expense.id == expense_id, Expense.shop_id == shop_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Expense not found")
    return e


def _fmt(e: Expense, include_proof: bool = False) -> dict:
    result = {
        "id":             e.id,
        "shop_id":        e.shop_id,
        "created_by":     e.created_by,
        "title":          e.title,
        "category":       e.category,
        "amount":         float(e.amount),
        "notes":          e.notes,
        "expense_date":   e.expense_date.isoformat() if e.expense_date else None,
        "created_at":     e.created_at.isoformat() if e.created_at else None,
        "has_proof":      bool(e.proof_data),
        "payment_method": e.payment_method,
        "bank_name":      e.bank_name,
        "bank_account":   e.bank_account,
        "receiver_phone": e.receiver_phone,
    }
    if include_proof:
        result["proof_data"] = e.proof_data
    return result


# ─────────────────────────────────────────
# LIST EXPENSES
# ─────────────────────────────────────────

@router.get("")
def list_expenses(
    db: Session = Depends(get_db),
    user: dict = Depends(require_financial_access),
    page: int = 1,
    limit: int = 25,
    category: ExpenseCategory | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
):
    # No shop yet (e.g. account not linked to a shop) — nothing to list.
    if not user["shop_id"]:
        return {"success": True, "data": {"items": [], "total": 0, "page": page, "limit": limit}}

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
    user: dict = Depends(require_financial_access),
    from_date: str | None = None,
    to_date: str | None = None,
):
    if not user["shop_id"]:
        return {"success": True, "data": {"total_expenses": 0.0, "count": 0}}

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
    user: dict = Depends(require_financial_access),
    from_date: str | None = None,
    to_date: str | None = None,
):
    if not user["shop_id"]:
        return {"success": True, "data": []}

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
    user: dict = Depends(require_financial_access),
    days: int = 14,
):
    if not user["shop_id"]:
        return {"success": True, "data": []}

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

@router.post("")
def create_expense(
    payload: ExpenseCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_financial_access),
):
    if not user["shop_id"]:
        raise HTTPException(status_code=400, detail="You need a shop before recording expenses")

    expense = Expense(
        shop_id=user["shop_id"],
        created_by=user["user_id"],
        title=payload.title,
        category=payload.category,
        amount=payload.amount,
        notes=payload.notes,
        expense_date=payload.expense_date,
        payment_method=payload.payment_method,
        bank_name=payload.bank_name,
        bank_account=payload.bank_account,
        receiver_phone=payload.receiver_phone,
    )
    db.add(expense)
    db.flush()
    emit(db, user, "expense.created", {
        k: v for k, v in _fmt(expense).items()
        if k in ("id", "title", "category", "amount", "payment_method", "expense_date")
    }, financial=True)
    db.commit()
    db.refresh(expense)

    return {"success": True, "message": "Expense recorded successfully", "data": _fmt(expense)}


# ─────────────────────────────────────────
# UPLOAD PROOF
# ─────────────────────────────────────────

_ALLOWED_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/pdf",
}
_MAX_BYTES     = 5 * 1024 * 1024  # 5 MB per file
_MAX_FILES     = 5


@router.post("/{expense_id}/proof")
async def upload_proof(
    expense_id: str,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: dict = Depends(require_financial_access),
):
    if len(files) > _MAX_FILES:
        raise HTTPException(400, f"Maximum {_MAX_FILES} files allowed")

    entries = []
    for f in files:
        if f.content_type not in _ALLOWED_TYPES:
            raise HTTPException(400, f"'{f.filename}': only JPEG, PNG, GIF, WebP and PDF accepted")
        content = await f.read()
        if len(content) > _MAX_BYTES:
            raise HTTPException(400, f"'{f.filename}' exceeds the 5 MB per-file limit")
        entries.append({
            "name": f.filename,
            "type": f.content_type,
            "data": f"data:{f.content_type};base64,{base64.b64encode(content).decode()}",
        })

    expense = _get_or_404(db, expense_id, user["shop_id"])
    expense.proof_data = json.dumps(entries)
    db.commit()

    return {"success": True, "message": f"{len(entries)} proof file(s) uploaded"}


# ─────────────────────────────────────────
# GET PROOF
# ─────────────────────────────────────────

@router.get("/{expense_id}/proof")
def get_proof(
    expense_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(require_financial_access),
):
    expense = _get_or_404(db, expense_id, user["shop_id"])
    files = json.loads(expense.proof_data) if expense.proof_data else []
    return {"success": True, "data": {"files": files}}


# ─────────────────────────────────────────
# DELETE PROOF
# ─────────────────────────────────────────

@router.delete("/{expense_id}/proof")
def delete_proof(
    expense_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(require_financial_access),
):
    expense = _get_or_404(db, expense_id, user["shop_id"])
    expense.proof_data = None
    db.commit()
    return {"success": True, "message": "Proof removed"}


# ─────────────────────────────────────────
# GET SINGLE EXPENSE
# ─────────────────────────────────────────

@router.get("/{expense_id}")
def get_expense(
    expense_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(require_financial_access),
):
    return {"success": True, "data": _fmt(_get_or_404(db, expense_id, user["shop_id"]), include_proof=True)}


# ─────────────────────────────────────────
# UPDATE EXPENSE
# ─────────────────────────────────────────

@router.put("/{expense_id}")
def update_expense(
    expense_id: str,
    payload: ExpenseUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_financial_access),
):
    expense = _get_or_404(db, expense_id, user["shop_id"])

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(expense, key, value)

    db.commit()
    db.refresh(expense)

    return {"success": True, "message": "Expense updated", "data": _fmt(expense)}


# ─────────────────────────────────────────
# ADMIN — list any shop's expenses
# ─────────────────────────────────────────

@router.get("/admin/list")
def admin_list_expenses(
    shop_id: str,
    page: int = 1,
    limit: int = 50,
    db: Session = Depends(get_db),
    user: dict = Depends(require_financial_access),
):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    q = (
        db.query(Expense)
        .filter(Expense.shop_id == shop_id)
        .order_by(Expense.expense_date.desc())
    )
    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()
    return {
        "success": True,
        "data": {"items": [_fmt(e) for e in items], "total": total, "page": page, "limit": limit},
    }


# ─────────────────────────────────────────
# ADMIN — update any expense
# ─────────────────────────────────────────

@router.put("/admin/{expense_id}")
def admin_update_expense(
    expense_id: str,
    payload: ExpenseUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_financial_access),
):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(expense, key, value)
    db.commit()
    db.refresh(expense)
    return {"success": True, "data": _fmt(expense)}


# ─────────────────────────────────────────
# DELETE EXPENSE
# ─────────────────────────────────────────

@router.delete("/{expense_id}")
def delete_expense(
    expense_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(require_financial_access),
):
    expense = _get_or_404(db, expense_id, user["shop_id"])
    db.delete(expense)
    db.commit()
    return {"success": True, "message": "Expense deleted"}
