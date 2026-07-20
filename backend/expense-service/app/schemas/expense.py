from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator
from app.models.expense import ExpenseCategory

VALID_PAYMENT_METHODS = {"mtn", "bank"}


class ExpenseCreate(BaseModel):
    title:          str
    category:       ExpenseCategory = ExpenseCategory.other
    amount:         Decimal = Field(..., gt=0)
    notes:          str | None = None
    expense_date:   datetime
    payment_method: str                # required — "mtn" | "bank"
    bank_name:      str | None = None
    bank_account:   str | None = None
    receiver_phone: str | None = None

    @field_validator("payment_method")
    @classmethod
    def validate_payment_method(cls, v: str) -> str:
        if v not in VALID_PAYMENT_METHODS:
            raise ValueError(f"payment_method must be one of: {', '.join(VALID_PAYMENT_METHODS)}")
        return v


class ExpenseUpdate(BaseModel):
    title:          str | None = None
    category:       ExpenseCategory | None = None
    amount:         Decimal | None = Field(None, gt=0)
    notes:          str | None = None
    expense_date:   datetime | None = None
    payment_method: str | None = None
    bank_name:      str | None = None
    bank_account:   str | None = None
    receiver_phone: str | None = None

    @field_validator("payment_method")
    @classmethod
    def validate_payment_method(cls, v: str | None) -> str | None:
        if v is not None and v not in VALID_PAYMENT_METHODS:
            raise ValueError(f"payment_method must be one of: {', '.join(VALID_PAYMENT_METHODS)}")
        return v
