import calendar
from decimal import Decimal
from datetime import date, datetime, time, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.expense import Expense, ExpenseCategory
from app.models.payroll import Attendance, Employee, SalaryAdvance, SalaryPayment
from app.schemas.payroll import AdvanceIn, AttendanceIn, EmployeeIn, PaymentIn
from app.core.security import get_current_user
from app.core.events import emit

# Monthly salaries: the manager keeps the list of employees, records each
# month's payment, and prints a confirmation the employee signs on receiving
# it. Each payment also adds a "salaries" expense, so reports include payroll.
# Advances (part of the salary paid early) are an expense the day they're
# given, and the next salary payment deducts them.
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


def _advance(a: SalaryAdvance) -> dict:
    return {
        "id": a.id,
        "employee_id": a.employee_id,
        "employee_name": a.employee_name,
        "employee_id_number": a.employee_id_number,
        "position": a.position,
        "amount": _money(a.amount),
        "given_on": a.given_on.isoformat(),
        "method": a.method,
        "reference": a.reference,
        "note": a.note,
        "payment_id": a.payment_id,
        "given_by_name": a.given_by_name,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def _outstanding(db: Session, shop_id: str, employee_id: str | None = None):
    """Advances not yet deducted from a salary, oldest first."""
    q = db.query(SalaryAdvance).filter(SalaryAdvance.shop_id == shop_id, SalaryAdvance.payment_id.is_(None))
    if employee_id:
        q = q.filter(SalaryAdvance.employee_id == employee_id)
    return q.order_by(SalaryAdvance.given_on, SalaryAdvance.created_at).all()


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
    if db.query(SalaryAdvance.id).filter(SalaryAdvance.shop_id == user["shop_id"], SalaryAdvance.employee_id == e.id).first():
        raise HTTPException(status_code=409, detail="This employee has salary advances. Set the date they left instead.")
    db.delete(e)
    db.commit()
    return {"success": True}


@router.get("/employees/{employee_id}/payments")
def employee_payments(employee_id: str, db: Session = Depends(get_db), user: dict = Depends(require_payroll)):
    e = _get_employee(db, user["shop_id"], employee_id)
    rows = (db.query(SalaryPayment).filter(SalaryPayment.shop_id == user["shop_id"], SalaryPayment.employee_id == e.id)
            .order_by(SalaryPayment.period.desc()).all())
    advances = (db.query(SalaryAdvance).filter(SalaryAdvance.shop_id == user["shop_id"], SalaryAdvance.employee_id == e.id)
                .order_by(SalaryAdvance.given_on.desc()).all())
    return {"success": True, "data": {"employee": _employee(e), "payments": [_payment(p) for p in rows],
                                      "advances": [_advance(a) for a in advances]}}


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
    advances: dict[str, list[dict]] = {}
    for a in _outstanding(db, shop):
        advances.setdefault(a.employee_id, []).append(_advance(a))
    counts = _attendance_counts(db, shop, first, last)
    rows = [{"employee": _employee(e), "payment": _payment(payments.pop(e.id)) if e.id in payments else None,
             "advances": advances.get(e.id, []), "attendance": counts.get(e.id, _NO_MARKS)} for e in employees]
    # Paid, though no longer in the list for that month (dates changed since).
    rows += [{"employee": None, "payment": _payment(p), "advances": []} for p in payments.values()]
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
                "advances_outstanding": sum(a["amount"] for r in rows for a in r["advances"]),
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

    # Advances given up to the payment date come off this salary.
    advances = [a for a in _outstanding(db, shop, e.id) if a.given_on <= payload.paid_on]
    advanced = sum((a.amount for a in advances), Decimal("0"))
    deductions = advanced + payload.deductions
    # The whole salary may have been taken in advance (nothing left to give),
    # but deductions can't go past it.
    if deductions > payload.gross or (deductions == payload.gross and payload.deductions > 0):
        raise HTTPException(status_code=400, detail=(
            f"Advances ({advanced:,.0f} RWF) and deductions are more than the salary." if advanced
            else "Deductions must be less than the salary."))
    deduction_note = "; ".join(x for x in [
        ("Advance " + ", ".join(f"{a.given_on.day} {MONTHS[a.given_on.month - 1][:3]}: {a.amount:,.0f}" for a in advances)) if advances else None,
        payload.deduction_note,
    ] if x)[:255] or None

    net = payload.gross - deductions
    label = _period_label(payload.period)
    try:
        # Nothing handed over (all taken in advance, already in Expenses): no expense.
        expense = None if net == 0 else Expense(
            shop_id=shop,
            created_by=user.get("user_id") or "",
            title=f"Salary {label}: {e.full_name}",
            category=ExpenseCategory.salaries,
            amount=net,
            notes="; ".join(x for x in [
                e.position,
                f"Deductions {deductions:,.0f} ({deduction_note})" if deductions > 0 else None,
                f"Ref {payload.reference}" if payload.reference else None,
            ] if x) or None,
            expense_date=datetime.combine(payload.paid_on, time(12, 0), tzinfo=timezone.utc),
            payment_method=payload.method,
        )
        if expense:
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
            deductions=deductions,
            deduction_note=deduction_note,
            net=net,
            paid_on=payload.paid_on,
            method=payload.method,
            reference=payload.reference,
            expense_id=expense.id if expense else None,
            paid_by=user.get("user_id"),
            paid_by_name=user.get("name") or user.get("email"),
        )
        db.add(p)
        db.flush()
        for a in advances:
            a.payment_id = p.id
        if expense:
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
    # The advances it deducted are owed again, to come off the next payment.
    db.query(SalaryAdvance).filter(SalaryAdvance.shop_id == user["shop_id"], SalaryAdvance.payment_id == p.id) \
        .update({"payment_id": None})
    db.delete(p)
    db.commit()
    return {"success": True}


# ─────────────────────────────────────────
# ADVANCES
# ─────────────────────────────────────────

@router.post("/advances")
def give_advance(payload: AdvanceIn, db: Session = Depends(get_db), user: dict = Depends(require_payroll)):
    shop = user["shop_id"]
    e = _get_employee(db, shop, payload.employee_id)
    if payload.given_on > _today():
        raise HTTPException(status_code=400, detail="The date can't be in the future.")
    if (e.start_date and payload.given_on < e.start_date) or (e.left_on and payload.given_on > e.left_on):
        raise HTTPException(status_code=400, detail="This employee wasn't working for you on that date.")
    # At most one month's salary, so the next payment can always take it back.
    owed = sum((a.amount for a in _outstanding(db, shop, e.id)), Decimal("0"))
    if owed + payload.amount > e.monthly_salary:
        left = max(e.monthly_salary - owed, Decimal("0"))
        raise HTTPException(status_code=400, detail=(
            f"Advances can't be more than the monthly salary ({e.monthly_salary:,.0f} RWF). "
            f"Already advanced: {owed:,.0f} RWF, so at most {left:,.0f} RWF more."))

    expense = Expense(
        shop_id=shop,
        created_by=user.get("user_id") or "",
        title=f"Salary advance: {e.full_name}",
        category=ExpenseCategory.salaries,
        amount=payload.amount,
        notes="; ".join(x for x in [
            e.position, payload.note, f"Ref {payload.reference}" if payload.reference else None,
        ] if x) or None,
        expense_date=datetime.combine(payload.given_on, time(12, 0), tzinfo=timezone.utc),
        payment_method=payload.method,
    )
    db.add(expense)
    db.flush()
    a = SalaryAdvance(
        shop_id=shop,
        employee_id=e.id,
        employee_name=e.full_name,
        employee_id_number=e.id_number,
        position=e.position,
        amount=payload.amount,
        given_on=payload.given_on,
        method=payload.method,
        reference=payload.reference,
        note=payload.note,
        expense_id=expense.id,
        given_by=user.get("user_id"),
        given_by_name=user.get("name") or user.get("email"),
    )
    db.add(a)
    db.flush()
    emit(db, user, "expense.created", {"id": expense.id, "title": expense.title, "amount": float(payload.amount), "category": "salaries"}, financial=True)
    db.commit()
    db.refresh(a)
    return {"success": True, "data": _advance(a)}


@router.delete("/advances/{advance_id}")
def remove_advance(advance_id: str, db: Session = Depends(get_db), user: dict = Depends(require_payroll)):
    """Takes back an advance recorded by mistake, with the expense it added."""
    a = db.query(SalaryAdvance).filter(SalaryAdvance.id == advance_id, SalaryAdvance.shop_id == user["shop_id"]).first()
    if not a:
        raise HTTPException(status_code=404, detail="Advance not found")
    if a.payment_id:
        raise HTTPException(status_code=409, detail="A salary payment already deducted this advance. Undo that payment first.")
    if a.expense_id:
        db.query(Expense).filter(Expense.id == a.expense_id, Expense.shop_id == user["shop_id"]).delete()
    db.delete(a)
    db.commit()
    return {"success": True}


# ─────────────────────────────────────────
# ATTENDANCE
# ─────────────────────────────────────────
# Each day the manager marks who came: present, absent, late or on leave.
# Payroll shows the month's counts beside each salary; nothing is deducted
# by itself.

_NO_MARKS = {"present": 0, "absent": 0, "late": 0, "leave": 0}


def _attendance_counts(db: Session, shop_id: str, first: date, last: date) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for a in db.query(Attendance).filter(Attendance.shop_id == shop_id, Attendance.day >= first, Attendance.day <= last):
        c = out.setdefault(a.employee_id, dict(_NO_MARKS))
        if a.status in c:
            c[a.status] += 1
    return out


def _on_staff(db: Session, shop_id: str, first: date, last: date):
    """Employees working at some point between first and last."""
    return (db.query(Employee).filter(Employee.shop_id == shop_id)
            .filter(or_(Employee.start_date.is_(None), Employee.start_date <= last))
            .filter(or_(Employee.left_on.is_(None), Employee.left_on >= first))
            .order_by(Employee.full_name).all())


def _day(day: str) -> date:
    try:
        return date.fromisoformat(day)
    except ValueError:
        raise HTTPException(status_code=400, detail="day must look like 2026-10-12")


def _mark(a: Attendance | None) -> dict | None:
    if a is None:
        return None
    return {"status": a.status, "note": a.note, "marked_by_name": a.marked_by_name,
            "updated_at": a.updated_at.isoformat() if a.updated_at else None}


@router.get("/attendance/day/{day}")
def attendance_day(day: str, db: Session = Depends(get_db), user: dict = Depends(require_payroll)):
    """Everyone working that day, each with their mark (or none yet)."""
    d = _day(day)
    shop = user["shop_id"]
    marks = {a.employee_id: a for a in db.query(Attendance).filter(Attendance.shop_id == shop, Attendance.day == d)}
    rows = [{"employee": _employee(e), "mark": _mark(marks.get(e.id))} for e in _on_staff(db, shop, d, d)]
    return {"success": True, "data": {"day": d.isoformat(), "today": _today().isoformat(), "rows": rows}}


@router.put("/attendance/day/{day}")
def mark_attendance(day: str, payload: AttendanceIn, db: Session = Depends(get_db), user: dict = Depends(require_payroll)):
    """Marks for one day (one person or everyone at once); a status of null
    clears that person's mark. Not for days still to come."""
    d = _day(day)
    if d > _today():
        raise HTTPException(status_code=400, detail="Attendance can't be marked for a day that hasn't come yet.")
    shop = user["shop_id"]
    staff = {e.id for e in _on_staff(db, shop, d, d)}
    existing = {a.employee_id: a for a in db.query(Attendance).filter(Attendance.shop_id == shop, Attendance.day == d)}
    for m in payload.marks:
        if m.employee_id not in staff:
            raise HTTPException(status_code=404, detail="Employee not found on that day.")
        a = existing.get(m.employee_id)
        if m.status is None:
            if a is not None:
                db.delete(a)
            continue
        if a is None:
            a = Attendance(shop_id=shop, employee_id=m.employee_id, day=d)
            db.add(a)
            existing[m.employee_id] = a
        a.status = m.status
        a.note = m.note
        a.marked_by = user.get("user_id")
        a.marked_by_name = user.get("name")
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Someone marked this day at the same time. Reload and try again.")
    return attendance_day(day, db, user)


@router.get("/attendance/month/{period}")
def attendance_month(period: str, db: Session = Depends(get_db), user: dict = Depends(require_payroll)):
    """The month per employee: days present, absent, late and on leave, and
    every mark by day (for the month's grid)."""
    try:
        first, last = _month_bounds(period)
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="period must look like 2026-10")
    shop = user["shop_id"]
    days: dict[str, dict[str, str]] = {}
    for a in db.query(Attendance).filter(Attendance.shop_id == shop, Attendance.day >= first, Attendance.day <= last):
        days.setdefault(a.employee_id, {})[a.day.isoformat()] = a.status
    counts = _attendance_counts(db, shop, first, last)
    rows = [{"employee": _employee(e), "counts": counts.get(e.id, _NO_MARKS), "days": days.get(e.id, {})}
            for e in _on_staff(db, shop, first, last)]
    return {"success": True, "data": {"period": period, "first": first.isoformat(), "last": last.isoformat(),
                                      "today": _today().isoformat(), "rows": rows}}
