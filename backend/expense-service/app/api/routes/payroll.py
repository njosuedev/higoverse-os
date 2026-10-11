import calendar
from datetime import date, datetime, time, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.expense import Expense, ExpenseCategory
from app.models.payroll import Employee, SalaryPayment
from app.schemas.payroll import EmployeeIn, PaymentIn
from app.core.security import get_current_user
from app.core.events import emit

# Monthly salaries: the manager keeps the list of employees, records each
# month's payment, and prints a confirmation the employee signs on receiving
# it. Each payment also adds a "salaries" expense, so reports include payroll.
router = APIRouter(prefix="/payroll", tags=["Payroll"])

PAYROLL_ROLES = {"owner", "admin", "manager", "accountant"}

MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]


def require_payroll(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") not in PAYROLL_ROLES:
        raise HTTPException(status_code=403, detail="Only the owner, a manager or the accountant can use payroll.")
    if not user.get("shop_id"):
        raise HTTPException(status_code=400, detail="You need a business first.")
    return user


def _money(v) -> float:
    return float(v) if v is not None else 0.0


def _employee(e: Employee) -> dict:
    return {
        "id": e.id,
        "full_name": e.full_name,
        "id_number": e.id_number,
        "phone": e.phone,
        "position": e.position,
        "monthly_salary": _money(e.monthly_salary),
        "start_date": e.start_date.isoformat() if e.start_date else None,
        "left_on": e.left_on.isoformat() if e.left_on else None,
        "active": e.active,
        "notes": e.notes,
    }


def _payment(p: SalaryPayment) -> dict:
    return {
        "id": p.id,
        "employee_id": p.employee_id,
        "period": p.period,
        "employee_name": p.employee_name,
        "employee_id_number": p.employee_id_number,
        "position": p.position,
        "gross": _money(p.gross),
        "deductions": _money(p.deductions),
        "deduction_note": p.deduction_note,
        "net": _money(p.net),
        "paid_on": p.paid_on.isoformat(),
        "method": p.method,
        "reference": p.reference,
        "expense_id": p.expense_id,
        "paid_by_name": p.paid_by_name,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _month_bounds(period: str) -> tuple[date, date]:
    y, m = (int(x) for x in period.split("-"))
    return date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1])


def _period_label(period: str) -> str:
    y, m = period.split("-")
    return f"{MONTHS[int(m) - 1]} {y}"


def _today() -> date:
    # Rwanda (UTC+2): "today" as the business sees it.
    return (datetime.now(timezone.utc) + timedelta(hours=2)).date()


def _get_employee(db: Session, shop_id: str, employee_id: str) -> Employee:
    e = db.query(Employee).filter(Employee.id == employee_id, Employee.shop_id == shop_id).first()
    if not e:
        raise HTTPException(status_code=404, detail="Employee not found")
    return e


# ─────────────────────────────────────────
# EMPLOYEES
# ─────────────────────────────────────────

@router.get("/employees")
def list_employees(db: Session = Depends(get_db), user: dict = Depends(require_payroll)):
    rows = (db.query(Employee).filter(Employee.shop_id == user["shop_id"])
            .order_by(Employee.left_on.isnot(None), Employee.full_name).all())
    return {"success": True, "data": [_employee(e) for e in rows]}


@router.post("/employees")
def add_employee(payload: EmployeeIn, db: Session = Depends(get_db), user: dict = Depends(require_payroll)):
    e = Employee(shop_id=user["shop_id"], created_by=user.get("user_id"), **payload.model_dump())
    db.add(e)
    db.commit()
    db.refresh(e)
    return {"success": True, "data": _employee(e)}


@router.put("/employees/{employee_id}")
def update_employee(employee_id: str, payload: EmployeeIn, db: Session = Depends(get_db), user: dict = Depends(require_payroll)):
    e = _get_employee(db, user["shop_id"], employee_id)
    for k, v in payload.model_dump().items():
        setattr(e, k, v)
    db.commit()
    db.refresh(e)
    return {"success": True, "data": _employee(e)}


@router.delete("/employees/{employee_id}")
def delete_employee(employee_id: str, db: Session = Depends(get_db), user: dict = Depends(require_payroll)):
    e = _get_employee(db, user["shop_id"], employee_id)
    paid = db.query(SalaryPayment.id).filter(SalaryPayment.shop_id == user["shop_id"], SalaryPayment.employee_id == e.id).first()
    if paid:
        # Their payments (and signed confirmations) must keep pointing somewhere.
        raise HTTPException(status_code=409, detail="This employee has salary payments. Set the date they left instead.")
    db.delete(e)
    db.commit()
    return {"success": True}


@router.get("/employees/{employee_id}/payments")
def employee_payments(employee_id: str, db: Session = Depends(get_db), user: dict = Depends(require_payroll)):
    e = _get_employee(db, user["shop_id"], employee_id)
    rows = (db.query(SalaryPayment).filter(SalaryPayment.shop_id == user["shop_id"], SalaryPayment.employee_id == e.id)
            .order_by(SalaryPayment.period.desc()).all())
    return {"success": True, "data": {"employee": _employee(e), "payments": [_payment(p) for p in rows]}}


# ─────────────────────────────────────────
# ONE MONTH
# ─────────────────────────────────────────

@router.get("/months/{period}")
def month(period: str, db: Session = Depends(get_db), user: dict = Depends(require_payroll)):
    """Everyone on the payroll that month (started by its end, not left
    before it began), each with their payment if made, and the totals."""
    try:
        first, last = _month_bounds(period)
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="period must look like 2026-10")
    shop = user["shop_id"]
    payments = {p.employee_id: p for p in db.query(SalaryPayment).filter(SalaryPayment.shop_id == shop, SalaryPayment.period == period)}
    employees = (db.query(Employee).filter(Employee.shop_id == shop)
                 .filter(or_(Employee.start_date.is_(None), Employee.start_date <= last))
                 .filter(or_(Employee.left_on.is_(None), Employee.left_on >= first))
                 .order_by(Employee.full_name).all())
    rows = [{"employee": _employee(e), "payment": _payment(payments.pop(e.id)) if e.id in payments else None} for e in employees]
    # Paid, though no longer in the list for that month (dates changed since).
    rows += [{"employee": None, "payment": _payment(p)} for p in payments.values()]
    paid = [r["payment"] for r in rows if r["payment"]]
    due = [r["employee"] for r in rows if not r["payment"] and r["employee"]]
    return {
        "success": True,
        "data": {
            "period": period,
            "rows": rows,
            "totals": {
                "employees": len(rows),
                "paid_count": len(paid),
                "paid_net": sum(p["net"] for p in paid),
                "paid_gross": sum(p["gross"] for p in paid),
                "due_count": len(due),
                "due_gross": sum(e["monthly_salary"] for e in due),
            },
        },
    }


# ─────────────────────────────────────────
# PAY / UNDO
# ─────────────────────────────────────────

@router.post("/payments")
def pay(payload: PaymentIn, db: Session = Depends(get_db), user: dict = Depends(require_payroll)):
    shop = user["shop_id"]
    e = _get_employee(db, shop, payload.employee_id)
    first, last = _month_bounds(payload.period)
    today = _today()
    if payload.paid_on > today:
        raise HTTPException(status_code=400, detail="The payment date can't be in the future.")
    # Paying ahead is fine for next month at most.
    if first > (today.replace(day=1) + timedelta(days=32)).replace(day=1):
        raise HTTPException(status_code=400, detail="That month is too far ahead.")
    if (e.start_date and e.start_date > last) or (e.left_on and e.left_on < first):
        raise HTTPException(status_code=400, detail="This employee wasn't working for you that month.")
    if db.query(SalaryPayment.id).filter(SalaryPayment.shop_id == shop, SalaryPayment.employee_id == e.id,
                                         SalaryPayment.period == payload.period).first():
        raise HTTPException(status_code=409, detail="This month's salary is already recorded for this employee.")

    net = payload.gross - payload.deductions
    label = _period_label(payload.period)
    try:
        expense = Expense(
            shop_id=shop,
            created_by=user.get("user_id") or "",
            title=f"Salary {label}: {e.full_name}",
            category=ExpenseCategory.salaries,
            amount=net,
            notes="; ".join(x for x in [
                e.position,
                f"Deductions {payload.deductions:,.0f} ({payload.deduction_note})" if payload.deductions > 0 else None,
                f"Ref {payload.reference}" if payload.reference else None,
            ] if x) or None,
            expense_date=datetime.combine(payload.paid_on, time(12, 0), tzinfo=timezone.utc),
            payment_method=payload.method,
        )
        db.add(expense)
        db.flush()
        p = SalaryPayment(
            shop_id=shop,
            employee_id=e.id,
            period=payload.period,
            employee_name=e.full_name,
            employee_id_number=e.id_number,
            position=e.position,
            gross=payload.gross,
            deductions=payload.deductions,
            deduction_note=payload.deduction_note,
            net=net,
            paid_on=payload.paid_on,
            method=payload.method,
            reference=payload.reference,
            expense_id=expense.id,
            paid_by=user.get("user_id"),
            paid_by_name=user.get("name") or user.get("email"),
        )
        db.add(p)
        db.flush()
        emit(db, user, "expense.created", {"id": expense.id, "title": expense.title, "amount": float(net), "category": "salaries"}, financial=True)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="This month's salary is already recorded for this employee.")
    db.refresh(p)
    return {"success": True, "data": _payment(p)}


@router.delete("/payments/{payment_id}")
def undo_payment(payment_id: str, db: Session = Depends(get_db), user: dict = Depends(require_payroll)):
    """Takes back a payment recorded by mistake, with the expense it added."""
    p = db.query(SalaryPayment).filter(SalaryPayment.id == payment_id, SalaryPayment.shop_id == user["shop_id"]).first()
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    if p.expense_id:
        db.query(Expense).filter(Expense.id == p.expense_id, Expense.shop_id == user["shop_id"]).delete()
    db.delete(p)
    db.commit()
    return {"success": True}
