import uuid
from sqlalchemy import Boolean, Column, Date, DateTime, Integer, Numeric, String, Text, UniqueConstraint
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
    # For the pay slip: where the salary goes, the contract's end, and the
    # working days in a month (the day wage is the salary divided by them).
    bank_name      = Column(String(100), nullable=True)
    bank_account   = Column(String(60), nullable=True)
    contract_end   = Column(Date, nullable=True)
    working_days   = Column(Integer, nullable=True, default=26)

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

    gross            = Column(Numeric(12, 2), nullable=False)    # the month's basic salary
    # Added to the basic salary (pay slip): bonus, accommodation, overtime.
    bonus            = Column(Numeric(12, 2), nullable=False, default=0)
    accommodation    = Column(Numeric(12, 2), nullable=False, default=0)
    overtime_hours   = Column(Numeric(6, 2), nullable=False, default=0)
    overtime_amount  = Column(Numeric(12, 2), nullable=False, default=0)
    deductions       = Column(Numeric(12, 2), nullable=False, default=0)
    deduction_note   = Column(String(255), nullable=True)        # e.g. "advance 20 Oct"
    net              = Column(Numeric(12, 2), nullable=False)    # what the employee received

    # As they were when paid, so the printed pay slip stays true: the bank
    # account, the contract, working days, and the month's attendance.
    bank_name        = Column(String(100), nullable=True)
    bank_account     = Column(String(60), nullable=True)
    contract_start   = Column(Date, nullable=True)
    contract_end     = Column(Date, nullable=True)
    working_days     = Column(Integer, nullable=True)
    late_days        = Column(Integer, nullable=False, default=0)
    leave_days       = Column(Integer, nullable=False, default=0)
    sick_days        = Column(Integer, nullable=False, default=0)

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
    status      = Column(String(10), nullable=False)          # present | absent | late | leave | sick
    note        = Column(String(255), nullable=True)

    marked_by      = Column(String, nullable=True)
    marked_by_name = Column(String(150), nullable=True)
    updated_at     = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class SalaryBonus(Base):
    """A bonus added to a salary already paid (e.g. at the end of the month).
    It is its own "salaries" expense on the day it's given, and is added to
    the payment's bonus and net, so the pay slip and the payroll sheet show
    it. Undoing the payment takes its bonuses back too."""
    __tablename__ = "payroll_bonuses"

    id               = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    shop_id          = Column(String, index=True, nullable=False)
    payment_id       = Column(String, index=True, nullable=False)
    employee_id      = Column(String, index=True, nullable=False)
    employee_name    = Column(String(150), nullable=False)

    amount           = Column(Numeric(12, 2), nullable=False)
    given_on         = Column(Date, nullable=False)
    method           = Column(String(20), nullable=False)        # cash | mtn | airtel | bank
    reference        = Column(String(100), nullable=True)
    note             = Column(String(255), nullable=True)        # what it's for

    expense_id       = Column(String, nullable=True)             # the "salaries" expense it added
    given_by         = Column(String, nullable=True)
    given_by_name    = Column(String(150), nullable=True)
    created_at       = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
