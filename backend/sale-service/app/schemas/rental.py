from datetime import date as date_cls
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator, model_validator


def _day(v: str | None) -> str | None:
    if v is None:
        return v
    try:
        date_cls.fromisoformat(v)
    except ValueError:
        raise ValueError("Dates must be YYYY-MM-DD")
    return v


def _clean(v: str | None) -> str | None:
    v = " ".join((v or "").split())
    return v or None


class RentalIn(BaseModel):
    customer_id: str | None = Field(None, max_length=64)
    customer: str | None = Field(None, max_length=150)
    customer_phone: str | None = Field(None, max_length=40)
    customer_id_no: str | None = Field(None, max_length=40)
    customer_address: str | None = Field(None, max_length=200)

    product_id: str | None = Field(None, max_length=64)
    car_name: str | None = Field(None, max_length=150)
    car_type: str | None = Field(None, max_length=60)
    plate_no: str | None = Field(None, max_length=30)
    chassis_no: str | None = Field(None, max_length=40)

    start_date: str
    end_date: str
    agreement_date: str | None = None
    rent_amount: Decimal = Field(ge=0, le=Decimal("100000000000"))
    deposit: Decimal = Field(Decimal(0), ge=0, le=Decimal("100000000000"))
    currency: str = Field("RWF", max_length=10)
    notes: str | None = Field(None, max_length=2000)

    @field_validator("customer", "customer_phone", "customer_id_no", "customer_address",
                     "car_name", "car_type", "plate_no", "chassis_no", "notes")
    @classmethod
    def tidy(cls, v: str | None) -> str | None:
        return _clean(v)

    @field_validator("start_date", "end_date", "agreement_date")
    @classmethod
    def day(cls, v: str | None) -> str | None:
        return _day(v)

    @model_validator(mode="after")
    def in_order(self):
        if self.end_date < self.start_date:
            raise ValueError("The end date can't be before the start date")
        # The renter's and the car's details are copied from Customers and
        # Vehicles (routes/rentals.py _fill), never typed on the rental.
        if not self.customer_id:
            raise ValueError("Pick the renter from Customers")
        if not self.product_id:
            raise ValueError("Pick the car from Vehicles")
        return self


class RentalDepositIn(BaseModel):
    """More deposit paid by the renter after the agreement."""
    amount: Decimal = Field(gt=0, le=Decimal("100000000000"))
    method: str
    date: str
    reference: str = Field("", max_length=120)

    @field_validator("method")
    @classmethod
    def method_known(cls, v: str) -> str:
        if v not in ("cash", "mtn", "airtel", "bank", "card"):
            raise ValueError("Choose how the deposit was paid (cash, MTN, Airtel, bank or card)")
        return v

    @field_validator("date")
    @classmethod
    def date_ok(cls, v: str) -> str:
        _day(v)
        if date_cls.fromisoformat(v) > date_cls.today():
            raise ValueError("A deposit can't be dated in the future")
        return v

    @field_validator("reference")
    @classmethod
    def tidy(cls, v: str) -> str:
        return _clean(v) or ""


class RentalReturn(BaseModel):
    deposit_returned: Decimal = Field(ge=0, le=Decimal("100000000000"))
    return_note: str | None = Field(None, max_length=2000)
