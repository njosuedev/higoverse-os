from decimal import Decimal
from pydantic import BaseModel, Field


class DebtCreate(BaseModel):
    debtor_name: str
    phone: str | None = None
    amount_owed: Decimal = Field(..., ge=0)
    amount_paid: Decimal = Field(default=Decimal("0"), ge=0)
    notes: str | None = None
    sale_id: str | None = None


class DebtUpdate(BaseModel):
    debtor_name: str | None = None
    phone: str | None = None
    amount_owed: Decimal | None = Field(None, ge=0)
    amount_paid: Decimal | None = Field(None, ge=0)
    notes: str | None = None
    is_paid: bool | None = None
