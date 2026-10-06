import re

from pydantic import BaseModel, field_validator


def _tin(v: str | None) -> str | None:
    """Customer TIN (RRA): empty, or exactly 9 digits."""
    if v is None:
        return v
    v = re.sub(r"[\s-]", "", v)
    if not v:
        return None
    if not re.fullmatch(r"\d{9}", v):
        raise ValueError("TIN must be exactly 9 digits")
    return v


class SupplierCreate(BaseModel):
    name: str
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    id_number: str | None = None
    tin: str | None = None
    company: str | None = None
    country: str | None = None

    _check_tin = field_validator("tin")(classmethod(lambda cls, v: _tin(v)))


class SupplierUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    id_number: str | None = None
    tin: str | None = None
    company: str | None = None
    country: str | None = None

    _check_tin = field_validator("tin")(classmethod(lambda cls, v: _tin(v)))
