import base64
import json
from datetime import datetime, timedelta, timezone
from typing import List
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from typing import Literal

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.expense import Expense, ExpenseCategory
from app.schemas.expense import ExpenseCreate, ExpenseUpdate
from app.core.security import require_expense_access, require_expense_totals
from app.core.events import emit

router = APIRouter(prefix="/expenses", tags=["Expenses"])


# ─────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────

# Money spent: every row except those marked as money received ("in").
_SPENT = or_(Expense.direction.is_(None), Expense.direction != "in")

Scope = Literal["rwanda", "abroad"]
# Abroad: before the goods reach Rwanda. Everything else (older rows) is Rwanda.
_ABROAD = Expense.scope == "abroad"
_RWANDA = or_(Expense.scope.is_(None), Expense.scope != "abroad")


def _in_scope(q, scope: str | None):
    return q.filter(_ABROAD if scope == "abroad" else _RWANDA) if scope else q


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
        "direction":      "in" if e.direction == "in" else "out",
        "scope":          "abroad" if e.scope == "abroad" else "rwanda",
        "ebm_support":    e.ebm_support,
        "supplier_name":  e.supplier_name,
        "supplier_tin":   e.supplier_tin,
        "doc_ref":        e.doc_ref,
        "no_ebm_reason":  e.no_ebm_reason,
        "voucher_no":     e.voucher_no,
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
    user: dict = Depends(require_expense_access),
    page: int = 1,
    limit: int = 25,
    category: ExpenseCategory | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    scope: Scope | None = None,
    support: str | None = None,   # "none": not supported by EBM (RRA Tax Ledger)
):
    # No shop yet (e.g. account not linked to a shop) — nothing to list.
    if not user["shop_id"]:
        return {"success": True, "data": {"items": [], "total": 0, "page": page, "limit": limit}}

    q = db.query(Expense).filter(Expense.shop_id == user["shop_id"])

    if category:
        q = q.filter(Expense.category == category)
    q = _in_scope(q, scope)
    if support == "none":
        q = q.filter(_NO_EBM)
    elif support in ("ebm", "wht", "dmc"):
        q = q.filter(Expense.ebm_support == support)
    if from_date:
        q = q.filter(Expense.expense_date >= datetime.fromisoformat(from_date + "T00:00:00"))
    if to_date:
        q = q.filter(Expense.expense_date <= datetime.fromisoformat(to_date + "T23:59:59"))

    q = q.order_by(Expense.expense_date.desc())
    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()
    # Records that came here by a type correction (routes/incomes.py).
    from app.models.correction import TransactionCorrection
    moved = {c.new_id for c in db.query(TransactionCorrection.new_id).filter(
        TransactionCorrection.shop_id == user["shop_id"], TransactionCorrection.new_id.in_([e.id for e in items]))} if items else set()

    return {
        "success": True,
        "data": {
            "items": [{**_fmt(e), "corrected": e.id in moved} for e in items],
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
    user: dict = Depends(require_expense_totals),
    from_date: str | None = None,
    to_date: str | None = None,
    scope: Scope | None = None,
):
    if not user["shop_id"]:
        return {"success": True, "data": {"total_expenses": 0.0, "count": 0, "total_in": 0.0, "count_in": 0,
                                          "rwanda": 0.0, "abroad": 0.0}}

    q = _in_scope(db.query(Expense).filter(Expense.shop_id == user["shop_id"]), scope)
    if from_date:
        q = q.filter(Expense.expense_date >= datetime.fromisoformat(from_date + "T00:00:00"))
    if to_date:
        q = q.filter(Expense.expense_date <= datetime.fromisoformat(to_date + "T23:59:59"))

    # Spending only: money received is reported apart, never as an expense.
    row = q.filter(_SPENT).with_entities(
        func.coalesce(func.sum(Expense.amount), 0).label("total_expenses"),
        func.count(Expense.id).label("count"),
    ).one()
    got = q.filter(Expense.direction == "in").with_entities(
        func.coalesce(func.sum(Expense.amount), 0).label("total"),
        func.count(Expense.id).label("count"),
    ).one()
    # Spending in two parts: abroad (before the goods reach Rwanda) and in Rwanda.
    abroad = q.filter(_SPENT, _ABROAD).with_entities(func.coalesce(func.sum(Expense.amount), 0)).scalar()

    return {
        "success": True,
        "data": {
            "total_expenses": float(row.total_expenses),
            "count": int(row.count),
            "total_in": float(got.total),
            "count_in": int(got.count),
            "abroad": float(abroad or 0),
            "rwanda": float(row.total_expenses) - float(abroad or 0),
        },
    }


# ─────────────────────────────────────────
# BY CATEGORY (for charts / reports)
# ─────────────────────────────────────────

@router.get("/by-category")
def get_by_category(
    db: Session = Depends(get_db),
    user: dict = Depends(require_expense_totals),
    from_date: str | None = None,
    to_date: str | None = None,
    scope: Scope | None = None,
):
    if not user["shop_id"]:
        return {"success": True, "data": []}

    q = _in_scope(db.query(Expense).filter(Expense.shop_id == user["shop_id"]), scope)
    if from_date:
        q = q.filter(Expense.expense_date >= datetime.fromisoformat(from_date + "T00:00:00"))
    if to_date:
        q = q.filter(Expense.expense_date <= datetime.fromisoformat(to_date + "T23:59:59"))

    rows = q.filter(_SPENT).with_entities(
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
    user: dict = Depends(require_expense_totals),
    days: int = 14,
):
    if not user["shop_id"]:
        return {"success": True, "data": []}

    since = datetime.now(timezone.utc) - timedelta(days=days)
    q = db.query(Expense).filter(
        Expense.shop_id == user["shop_id"],
        Expense.expense_date >= since,
        _SPENT,
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
    user: dict = Depends(require_expense_access),
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
        direction="in" if payload.direction == "in" else None,
        scope="abroad" if payload.scope == "abroad" else None,
    )
    _set_support(expense, payload.model_dump(include=_SUPPORT_FIELDS))
    _refuse_duplicate(db, expense)
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
# RRA TAX LEDGER (expenses not supported by EBM)
# ─────────────────────────────────────────

_SUPPORT_FIELDS = {"ebm_support", "supplier_name", "supplier_tin", "doc_ref", "no_ebm_reason"}

# Not supported by EBM: marked so, or never marked (every expense recorded
# before the RRA choice existed had no EBM), except salaries (declared
# through payroll) and taxes paid (not purchases), which only count when
# marked "none" on purpose.
_NO_EBM = or_(
    Expense.ebm_support == "none",
    and_(Expense.ebm_support.is_(None),
         Expense.category.notin_([ExpenseCategory.salaries, ExpenseCategory.taxes])),
)


def _norm_ref(x) -> str:
    """A document number as compared: "L 20327" and "l20327" are the same."""
    return "".join(str(x or "").split()).upper()


def _refuse_duplicate(db: Session, expense: Expense) -> None:
    """No expense is recorded twice. Refused when another expense of the
    business has the same document number (EBM receipt, customs assessment,
    WHT declaration, receipt or bank reference), or the same day, amount and
    description (and the same payee, when both name one)."""
    q = db.query(Expense).filter(Expense.shop_id == expense.shop_id)
    if expense.id:
        q = q.filter(Expense.id != expense.id)
    ref = _norm_ref(expense.doc_ref)
    if ref:
        same = q.filter(func.upper(func.regexp_replace(Expense.doc_ref, r"\s+", "", "g")) == ref).first()
        if same:
            raise HTTPException(status_code=409, detail=(
                f"Already recorded: document {expense.doc_ref} is on the expense \"{same.title}\" of "
                f"{same.expense_date:%d/%m/%Y} ({float(same.amount):,.0f}). An expense can't be recorded twice."))
    title = " ".join((expense.title or "").lower().split())
    day = expense.expense_date.date() if expense.expense_date else None
    if not title or day is None:
        return
    for same in q.filter(func.date(Expense.expense_date) == day, Expense.amount == expense.amount).all():
        if " ".join((same.title or "").lower().split()) != title:
            continue
        a, b = (expense.supplier_name or "").strip().lower(), (same.supplier_name or "").strip().lower()
        if a and b and a != b:
            continue  # same work, paid to two different people
        raise HTTPException(status_code=409, detail=(
            f"Already recorded: \"{same.title}\" of {float(same.amount):,.0f} on {same.expense_date:%d/%m/%Y}. "
            "An expense can't be recorded twice. If this is a different payment, say who was paid or add the "
            "document number."))


def _tidy(x) -> str | None:
    return (str(x).strip() or None) if x is not None else None


def _set_support(expense: Expense, v: dict) -> None:
    """What supports the expense for RRA. One with no EBM keeps who was
    paid and why there is no EBM (the RRA Tax Ledger needs them)."""
    expense.ebm_support = v.get("ebm_support") or None
    expense.doc_ref = _tidy(v.get("doc_ref"))
    expense.supplier_name = _tidy(v.get("supplier_name"))
    expense.supplier_tin = _tidy(v.get("supplier_tin"))
    if expense.ebm_support == "none":
        if not expense.supplier_name:
            raise HTTPException(status_code=422, detail="An expense without EBM needs the name of who was paid.")
        if not v.get("no_ebm_reason"):
            raise HTTPException(status_code=422, detail="Say why there is no EBM receipt for this expense.")
        expense.no_ebm_reason = v.get("no_ebm_reason")
    else:
        expense.no_ebm_reason = None


@router.get("/rra-ledger")
def rra_ledger(
    from_date: str,
    to_date: str,
    db: Session = Depends(get_db),
    user: dict = Depends(require_expense_access),
):
    """Every expense of the period not supported by EBM, WHT or a customs
    declaration, oldest first, with what is still missing before it can be
    lodged in the RRA Tax Ledger. The documents themselves come from
    GET /expenses/{id}/proof."""
    if not user["shop_id"]:
        return {"success": True, "data": {"items": [], "total": 0}}
    try:
        start = datetime.fromisoformat(from_date[:10] + "T00:00:00")
        end = datetime.fromisoformat(to_date[:10] + "T23:59:59")
    except ValueError:
        raise HTTPException(status_code=422, detail="Dates must be YYYY-MM-DD.")
    rows = (
        db.query(Expense)
        .filter(Expense.shop_id == user["shop_id"], _NO_EBM, _SPENT,
                Expense.expense_date >= start, Expense.expense_date <= end)
        .order_by(Expense.expense_date, Expense.created_at)
        .all()
    )
    items = []
    for e in rows:
        files = json.loads(e.proof_data) if e.proof_data else []
        missing = [k for k, ok in (("proof", bool(files)), ("supplier_name", bool(e.supplier_name)),
                                   ("reason", bool(e.no_ebm_reason)), ("supplier_tin", bool(e.supplier_tin)),
                                   ("doc_ref", bool(e.doc_ref))) if not ok]
        items.append({**_fmt(e), "proof_count": len(files),
                      "proof_names": [f.get("name") for f in files], "missing": missing})
    return {"success": True, "data": {"items": items, "total": round(sum(i["amount"] for i in items), 2)}}


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
    user: dict = Depends(require_expense_access),
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
    user: dict = Depends(require_expense_access),
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
    user: dict = Depends(require_expense_access),
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
    user: dict = Depends(require_expense_access),
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
    user: dict = Depends(require_expense_access),
):
    expense = _get_or_404(db, expense_id, user["shop_id"])

    changes = payload.model_dump(exclude_unset=True)
    support = {k: changes.pop(k) for k in list(changes) if k in _SUPPORT_FIELDS}
    if support:
        _set_support(expense, {**{k: getattr(expense, k) for k in _SUPPORT_FIELDS}, **support})
    for key, value in changes.items():
        if key == "direction":
            value = "in" if value == "in" else None
        if key == "scope":
            value = "abroad" if value == "abroad" else None
        setattr(expense, key, value)
    with db.no_autoflush:
        _refuse_duplicate(db, expense)

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
    user: dict = Depends(require_expense_access),
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
    user: dict = Depends(require_expense_access),
):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        if key == "direction":
            value = "in" if value == "in" else None
        if key == "scope":
            value = "abroad" if value == "abroad" else None
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
    user: dict = Depends(require_expense_access),
):
    expense = _get_or_404(db, expense_id, user["shop_id"])
    db.delete(expense)
    db.commit()
    return {"success": True, "message": "Expense deleted"}
