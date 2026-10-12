import uuid
from sqlalchemy import Boolean, Column, Date, DateTime, Numeric, String, Text, UniqueConstraint
from sqlalchemy.sql import func
from app.db.database import Base


class Employee(Base):
    """A person the business pays a monthly salary. Kept by the manager;
    no sign-in needed (Team accounts are separate)."""
    __tablename__ = "payroll_employees"

    id             = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    shop_id        = Column(String, index=True, nullable=False)

    full_name      = Column(String(150), nullable=False)
    id_number      = Column(String(40), nullable=True)    # national ID / passport
    phone          = Column(String(30), nullable=True)
    position       = Column(String(100), nullable=True)
    monthly_salary = Column(Numeric(12, 2), nullable=False)
    start_date     = Column(Date, nullable=True)
    # Left the business: kept for the history, not paid after this day.
    left_on        = Column(Date, nullable=True)
    notes          = Column(Text, nullable=True)

    created_by     = Column(String, nullable=True)
    created_at     = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    @property
    def active(self) -> bool:
        return self.left_on is None


class SalaryPayment(Base):
    """One employee's salary for one month, as paid. The employee's name, ID
    and position are copied in, so a printed confirmation stays true even if
    their record changes later. Paying also records a "salaries" expense."""
    __tablename__ = "payroll_payments"
    __table_args__ = (UniqueConstraint("shop_id", "employee_id", "period", name="uq_payroll_payment_month"),)

    id               = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    shop_id          = Column(String, index=True, nullable=False)
    employee_id      = Column(String, index=True, nullable=False)
    period           = Column(String(7), index=True, nullable=False)   # "2026-10"

    employee_name    = Column(String(150), nullable=False)
    employee_id_number = Column(String(40), nullable=True)
    position         = Column(String(100), nullable=True)

    gross            = Column(Numeric(12, 2), nullable=False)    # the month's salary
    deductions       = Column(Numeric(12, 2), nullable=False, default=0)
    deduction_note   = Column(String(255), nullable=True)        # e.g. "advance 20 Oct"
    net              = Column(Numeric(12, 2), nullable=False)    # what the employee received

    paid_on          = Column(Date, nullable=False)
    method           = Column(String(20), nullable=False)        # cash | mtn | airtel | bank
    reference        = Column(String(100), nullable=True)        # transfer / MoMo reference

    expense_id       = Column(String, nullable=True)             # the "salaries" expense it added
    paid_by          = Column(String, nullable=True)
    paid_by_name     = Column(String(150), nullable=True)
    created_at       = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class SalaryAdvance(Base):
    """Part of a salary paid before payday. It is a "salaries" expense the
    day the money is given; the employee's next salary payment deducts it
    (payment_id), so the month's salary expense still adds up to the salary."""
    __tablename__ = "payroll_advances"

    id               = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    shop_id          = Column(String, index=True, nullable=False)
    employee_id      = Column(String, index=True, nullable=False)
    employee_name    = Column(String(150), nullable=False)
    employee_id_number = Column(String(40), nullable=True)
    position         = Column(String(100), nullable=True)

    amount           = Column(Numeric(12, 2), nullable=False)
    given_on         = Column(Date, nullable=False)
    method           = Column(String(20), nullable=False)        # cash | mtn | airtel | bank
    reference        = Column(String(100), nullable=True)
    note             = Column(String(255), nullable=True)        # what it's for

    expense_id       = Column(String, nullable=True)             # the "salaries" expense it added
    # The salary payment that deducted it; empty while still to be deducted.
    payment_id       = Column(String, index=True, nullable=True)
    given_by         = Column(String, nullable=True)
    given_by_name    = Column(String(150), nullable=True)
    created_at       = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Attendance(Base):
    """Whether an employee came to work on a day: present, absent, late or on
    leave, with a note. One mark per employee per day; no mark means not
    recorded. Shown beside the month's salary on Payroll, never deducted by
    itself (the person paying decides)."""
    __tablename__ = "payroll_attendance"
    __table_args__ = (UniqueConstraint("shop_id", "employee_id", "day", name="uq_payroll_attendance_day"),)

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    shop_id     = Column(String, index=True, nullable=False)
    employee_id = Column(String, index=True, nullable=False)
    day         = Column(Date, index=True, nullable=False)
    status      = Column(String(10), nullable=False)          # present | absent | late | leave
    note        = Column(String(255), nullable=True)

    marked_by      = Column(String, nullable=True)
    marked_by_name = Column(String(150), nullable=True)
    updated_at     = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
