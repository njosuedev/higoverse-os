import re
from datetime import date
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator, model_validator

PAY_METHODS = {"cash", "mtn", "airtel", "bank"}
_PERIOD = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def _clean(v: str | None) -> str | None:
    v = " ".join((v or "").split())
    return v or None


class EmployeeIn(BaseModel):
    full_name:      str = Field(..., min_length=2, max_length=150)
    id_number:      str | None = Field(None, max_length=40)
    phone:          str | None = Field(None, max_length=30)
    position:       str | None = Field(None, max_length=100)
    monthly_salary: Decimal = Field(..., gt=0, le=Decimal("1000000000"))
    start_date:     date | None = None
    left_on:        date | None = None
    notes:          str | None = Field(None, max_length=1000)
    bank_name:      str | None = Field(None, max_length=100)
    bank_account:   str | None = Field(None, max_length=60)
    contract_end:   date | None = None
    working_days:   int = Field(26, ge=1, le=31)

    @field_validator("full_name", "id_number", "phone", "position", "notes", "bank_name", "bank_account")
    @classmethod
    def tidy(cls, v: str | None) -> str | None:
        return _clean(v)

    @model_validator(mode="after")
    def dates_in_order(self):
        if self.start_date and self.left_on and self.left_on < self.start_date:
            raise ValueError("The leaving date is before the start date.")
        if self.start_date and self.contract_end and self.contract_end < self.start_date:
            raise ValueError("The contract ends before it starts.")
        return self


class PaymentIn(BaseModel):
    employee_id:    str
    period:         str                      # "2026-10"
    gross:          Decimal = Field(..., gt=0, le=Decimal("1000000000"))
    bonus:          Decimal = Field(Decimal("0"), ge=0, le=Decimal("1000000000"))
    accommodation:  Decimal = Field(Decimal("0"), ge=0, le=Decimal("1000000000"))
    overtime_hours: Decimal = Field(Decimal("0"), ge=0, le=Decimal("744"))
    overtime_amount: Decimal = Field(Decimal("0"), ge=0, le=Decimal("1000000000"))
    deductions:     Decimal = Field(Decimal("0"), ge=0)
    deduction_note: str | None = Field(None, max_length=255)
    paid_on:        date
    method:         str
    reference:      str | None = Field(None, max_length=100)

    @field_validator("period")
    @classmethod
    def valid_period(cls, v: str) -> str:
        if not _PERIOD.match(v):
            raise ValueError("period must look like 2026-10")
        return v

    @field_validator("method")
    @classmethod
    def valid_method(cls, v: str) -> str:
        if v not in PAY_METHODS:
            raise ValueError(f"method must be one of: {', '.join(sorted(PAY_METHODS))}")
        return v

    @field_validator("deduction_note", "reference")
    @classmethod
    def tidy(cls, v: str | None) -> str | None:
        return _clean(v)

    @property
    def total(self) -> Decimal:
        """The month's pay before deductions: basic + bonus + accommodation + overtime."""
        return self.gross + self.bonus + self.accommodation + self.overtime_amount

    @model_validator(mode="after")
    def deductions_fit(self):
        if self.deductions >= self.total:
            raise ValueError("Deductions must be less than the salary.")
        if self.deductions > 0 and not self.deduction_note:
            raise ValueError("Say what the deduction is for.")
        return self


class AdvanceIn(BaseModel):
    employee_id: str
    amount:      Decimal = Field(..., gt=0, le=Decimal("1000000000"))
    given_on:    date
    method:      str
    reference:   str | None = Field(None, max_length=100)
    note:        str | None = Field(None, max_length=255)

    @field_validator("method")
    @classmethod
    def valid_method(cls, v: str) -> str:
        if v not in PAY_METHODS:
            raise ValueError(f"method must be one of: {', '.join(sorted(PAY_METHODS))}")
        return v

    @field_validator("reference", "note")
    @classmethod
    def tidy(cls, v: str | None) -> str | None:
        return _clean(v)



class BonusIn(BaseModel):
    """A bonus added to a salary already paid."""
    amount:    Decimal = Field(..., gt=0, le=Decimal("1000000000"))
    given_on:  date
    method:    str
    reference: str | None = Field(None, max_length=100)
    note:      str | None = Field(None, max_length=255)

    @field_validator("method")
    @classmethod
    def valid_method(cls, v: str) -> str:
        if v not in PAY_METHODS:
            raise ValueError(f"method must be one of: {', '.join(sorted(PAY_METHODS))}")
        return v

    @field_validator("reference", "note")
    @classmethod
    def tidy(cls, v: str | None) -> str | None:
        return _clean(v)


ATTENDANCE = {"present", "absent", "late", "leave", "sick"}


class AttendanceMark(BaseModel):
    """One employee's mark for the day; status None clears it."""
    employee_id: str
    status:      str | None = None
    note:        str | None = Field(None, max_length=255)

    @field_validator("status")
    @classmethod
    def known(cls, v: str | None) -> str | None:
        if v is not None and v not in ATTENDANCE:
            raise ValueError("status must be present, absent, late, leave or sick")
        return v

    @field_validator("note")
    @classmethod
    def tidy(cls, v: str | None) -> str | None:
        return _clean(v)


class AttendanceIn(BaseModel):
    """Marks for one day, several at once ("everyone present")."""
    marks: list[AttendanceMark] = Field(..., min_length=1, max_length=500)
