import re
from pydantic import BaseModel, Field, field_validator

from app.ebm import codes


def _origin(v: str | None) -> str | None:
    if v is None:
        return v
    v = v.strip().upper()
    if not re.fullmatch(r"[A-Z]{2}", v):
        raise ValueError("The origin country is a 2-letter code, e.g. RW, CN or JP")
    return v


class EbmConfigUpdate(BaseModel):
    enabled: bool | None = None
    auto_issue: bool | None = None
    report_stock: bool | None = None
    tin: str | None = None
    bhf_id: str | None = None
    device_serial: str | None = Field(None, max_length=100)
    default_item_class: str | None = None
    default_tax_type: str | None = None
    # Country the goods come from (RRA nation code, e.g. RW, CN, JP), used in item codes.
    default_origin: str | None = None

    @field_validator("default_origin")
    @classmethod
    def origin(cls, v):
        return _origin(v)

    @field_validator("tin")
    @classmethod
    def tin_9(cls, v):
        if v is None:
            return v
        v = re.sub(r"\D", "", v)
        if len(v) != 9:
            raise ValueError("The TIN has 9 digits")
        return v

    @field_validator("bhf_id")
    @classmethod
    def branch(cls, v):
        if v is None:
            return v
        v = v.strip()
        if not re.fullmatch(r"\d{2}", v):
            raise ValueError("The branch ID has 2 digits (00 is the head office)")
        return v

    @field_validator("device_serial")
    @classmethod
    def serial(cls, v):
        if v is None:
            return v
        v = v.strip()
        if not re.fullmatch(r"[A-Za-z0-9_.-]{1,100}", v):
            raise ValueError("The device serial number has only letters, digits, dots, dashes and underscores")
        return v

    @field_validator("default_item_class")
    @classmethod
    def item_class(cls, v):
        if v is None or v == "":
            return None
        if not re.fullmatch(r"\d{1,10}", v.strip()):
            raise ValueError("An item classification code has up to 10 digits")
        return v.strip()

    @field_validator("default_tax_type")
    @classmethod
    def tax_type(cls, v):
        if v is None:
            return v
        if v not in codes.TAX_RATES:
            raise ValueError("Tax type is A, B, C or D")
        return v


class EbmItemUpdate(BaseModel):
    item_class: str | None = None
    tax_type: str | None = None
    item_type: str | None = None
    origin: str | None = None

    @field_validator("origin")
    @classmethod
    def check_origin(cls, v):
        return _origin(v)

    @field_validator("item_class")
    @classmethod
    def check_class(cls, v):
        if v is None:
            return v
        if not re.fullmatch(r"\d{1,10}", v.strip()):
            raise ValueError("An item classification code has up to 10 digits")
        return v.strip()

    @field_validator("tax_type")
    @classmethod
    def check_tax(cls, v):
        if v is not None and v not in codes.TAX_RATES:
            raise ValueError("Tax type is A, B, C or D")
        return v

    @field_validator("item_type")
    @classmethod
    def check_type(cls, v):
        if v is not None and v not in codes.ITEM_TYPES:
            raise ValueError("Item type is 1 (raw material), 2 (finished product) or 3 (service)")
        return v


class EbmIssue(BaseModel):
    sale_ids: list[str] = Field(..., min_length=1, max_length=100)
    # Override the sale's customer (e.g. a TIN asked at the till).
    customer_tin: str | None = Field(None, max_length=20)
    customer_name: str | None = Field(None, max_length=60)
    customer_phone: str | None = Field(None, max_length=20)


class EbmRefund(BaseModel):
    reason: str = Field(..., min_length=2, max_length=2)
    # The refund log book (CIS spec §14): the justification and who was refunded.
    note: str = Field(..., min_length=3, max_length=500)
    recipient: str = Field(..., min_length=2, max_length=100)


class EbmCashMoveIn(BaseModel):
    kind: str = Field(..., pattern="^(deposit|withdrawal)$")
    amount: float = Field(..., gt=0, le=1_000_000_000_000)
    note: str | None = Field(None, max_length=200)


class EbmCloseDay(BaseModel):
    day: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class EbmLookup(BaseModel):
    sale_ids: list[str] = Field(..., max_length=500)
