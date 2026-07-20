from decimal import Decimal
from typing import Literal
from pydantic import BaseModel

ProformaStatus = Literal["draft", "sent", "accepted", "expired"]


class ProformaLine(BaseModel):
    product_name: str
    qty: float
    unit_price: Decimal


class ProformaCreate(BaseModel):
    invoice_no: str
    date: str
    valid_until: str
    customer: str = ""
    customer_phone: str = ""
    customer_address: str = ""
    notes: str = ""
    lines: list[ProformaLine]
    subtotal: Decimal
    tax_rate: Decimal = Decimal("0")
    tax_amount: Decimal = Decimal("0")
    grand_total: Decimal
    currency: str = "RWF"
    status: ProformaStatus = "draft"


class ProformaUpdate(BaseModel):
    invoice_no: str | None = None
    date: str | None = None
    valid_until: str | None = None
    customer: str | None = None
    customer_phone: str | None = None
    customer_address: str | None = None
    notes: str | None = None
    lines: list[ProformaLine] | None = None
    subtotal: Decimal | None = None
    tax_rate: Decimal | None = None
    tax_amount: Decimal | None = None
    grand_total: Decimal | None = None
    currency: str | None = None
    status: ProformaStatus | None = None
