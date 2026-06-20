from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field
from app.models.expense import ExpenseCategory


class ExpenseCreate(BaseModel):
    title:        str
    category:     ExpenseCategory = ExpenseCategory.other
    amount:       Decimal = Field(..., gt=0)
    notes:        str | None = None
    expense_date: datetime


class ExpenseUpdate(BaseModel):
    title:        str | None = None
    category:     ExpenseCategory | None = None
    amount:       Decimal | None = Field(None, gt=0)
    notes:        str | None = None
    expense_date: datetime | None = None
