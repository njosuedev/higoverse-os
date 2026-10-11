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

    @field_validator("full_name", "id_number", "phone", "position", "notes")
    @classmethod
    def tidy(cls, v: str | None) -> str | None:
        return _clean(v)

    @model_validator(mode="after")
    def dates_in_order(self):
        if self.start_date and self.left_on and self.left_on < self.start_date:
            raise ValueError("The leaving date is before the start date.")
        return self


class PaymentIn(BaseModel):
    employee_id:    str
    period:         str                      # "2026-10"
    gross:          Decimal = Field(..., gt=0, le=Decimal("1000000000"))
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

    @model_validator(mode="after")
    def deductions_fit(self):
        if self.deductions >= self.gross:
            raise ValueError("Deductions must be less than the salary.")
        if self.deductions > 0 and not self.deduction_note:
            raise ValueError("Say what the deduction is for.")
        return self
