from decimal import Decimal
from typing import Literal
from pydantic import BaseModel, Field

# "approved" and "sold" are only reached through /approve and /sell.
# "sent" and "accepted" are older statuses kept so existing proformas load;
# older phone apps still send "accepted", which the route treats as approve.
ProformaStatus = Literal["draft", "sent", "accepted", "approved", "sold", "expired"]
EditableStatus = Literal["draft", "sent", "accepted", "expired"]


class ProformaLine(BaseModel):
    product_name: str
    qty: float = Field(gt=0)
    unit_price: Decimal = Field(ge=0)
    # Set when the line was picked from stock; only those lines can be sold.
    product_id: str | None = None
    # Vehicle details (car companies); empty for other businesses.
    car_type: str | None = None
    year: str | None = None
    color: str | None = None
    mileage: str | None = None
    energy: str | None = None
    chassis_no: str | None = None
    plate_no: str | None = None
    condition: str | None = None


class ProformaCreate(BaseModel):
    invoice_no: str
    date: str
    valid_until: str
    salesperson: str = ""
    customer_id: str | None = None
    customer: str = ""
    customer_phone: str = ""
    customer_address: str = ""
    customer_id_no: str = ""
    customer_tin: str = ""
    customer_email: str = ""
    customer_country: str = ""
    customer_company: str = ""
    notes: str = ""
    lines: list[ProformaLine]
    subtotal: Decimal
    tax_rate: Decimal = Decimal("0")
    tax_amount: Decimal = Decimal("0")
    grand_total: Decimal
    currency: str = "RWF"
    payment_method: str = ""
    bank_details: str = ""
    deposit_amount: Decimal = Field(Decimal("0"), ge=0)
    terms: str = ""
    status: EditableStatus = "draft"


class ProformaUpdate(BaseModel):
    invoice_no: str | None = None
    date: str | None = None
    valid_until: str | None = None
    salesperson: str | None = None
    customer_id: str | None = None
    customer: str | None = None
    customer_phone: str | None = None
    customer_address: str | None = None
    customer_id_no: str | None = None
    customer_tin: str | None = None
    customer_email: str | None = None
    customer_country: str | None = None
    customer_company: str | None = None
    notes: str | None = None
    lines: list[ProformaLine] | None = None
    subtotal: Decimal | None = None
    tax_rate: Decimal | None = None
    tax_amount: Decimal | None = None
    grand_total: Decimal | None = None
    currency: str | None = None
    payment_method: str | None = None
    bank_details: str | None = None
    deposit_amount: Decimal | None = Field(None, ge=0)
    terms: str | None = None
    status: EditableStatus | None = None


class ProformaSell(BaseModel):
    """The customer decided to buy: record the sales."""
    payment_method: str = "cash"
    # What the customer paid now; None means paid in full.
    amount_paid: Decimal | None = Field(None, ge=0)
    # A saved customer to record the sale under (required for car companies).
    customer_id: str | None = None
