import re
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator


class BankAccount(BaseModel):
    """One of the company's bank accounts (printed on proformas)."""
    id: str | None = None
    bank_name: str
    bank_account: str
    bank_holder: str
    is_default: bool = False

    @field_validator("bank_name", "bank_holder")
    @classmethod
    def names(cls, v: str, info) -> str:
        v = " ".join((v or "").split())
        limit = 100 if info.field_name == "bank_name" else 150
        if len(v) < 2 or len(v) > limit:
            what = "Bank name" if info.field_name == "bank_name" else "Account holder name"
            raise ValueError(f"{what} must be 2–{limit} characters")
        return v

    @field_validator("bank_account")
    @classmethod
    def number(cls, v: str) -> str:
        v = " ".join((v or "").split())
        if not re.fullmatch(r"[0-9][0-9 -]{4,38}[0-9]", v) or not 6 <= len(re.sub(r"\D", "", v)) <= 30:
            raise ValueError("Account number must be 6–30 digits")
        return v


class SettingsUpdate(BaseModel):
    shop_name: str | None = None
    phone: str | None = None
    address: str | None = None
    currency: str | None = None
    language: str | None = None
    low_stock_threshold: int | None = Field(None, ge=0)
    tax_rate: Decimal | None = Field(None, ge=0, le=100)
    car_types: list[str] | None = None
    car_names: list[str] | None = None
    bank_accounts: list[BankAccount] | None = None
    bank_name: str | None = None
    bank_account: str | None = None
    bank_holder: str | None = None

    @field_validator("bank_name", "bank_holder")
    @classmethod
    def clean_text(cls, v: str | None, info) -> str | None:
        if v is None:
            return v
        v = " ".join(v.split())
        if not v:
            return None
        limit = 100 if info.field_name == "bank_name" else 150
        if len(v) < 2 or len(v) > limit:
            raise ValueError(f"{'Bank name' if info.field_name == 'bank_name' else 'Account holder name'} must be 2–{limit} characters")
        return v

    @field_validator("bank_account")
    @classmethod
    def clean_account(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = " ".join(v.split())
        if not v:
            return None
        # Bank account numbers: digits, with spaces or dashes between groups.
        if not re.fullmatch(r"[0-9][0-9 -]{4,38}[0-9]", v) or not 6 <= len(re.sub(r"\D", "", v)) <= 30:
            raise ValueError("Account number must be 6–30 digits")
        return v

    @field_validator("car_names")
    @classmethod
    def clean_car_names(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        # Trim, single spaces, drop blanks and case-insensitive duplicates.
        seen, out = set(), []
        for name in v:
            name = " ".join(name.split())[:80]
            if len(name) >= 2 and name.lower() not in seen:
                seen.add(name.lower())
                out.append(name)
        if len(out) > 300:
            raise ValueError("Too many car names (max 300)")
        return sorted(out, key=str.lower)

    @field_validator("car_types")
    @classmethod
    def clean_car_types(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        # Trim, drop blanks and case-insensitive duplicates, keep order.
        seen, out = set(), []
        for name in v:
            name = name.strip()[:50]
            if name and name.lower() not in seen:
                seen.add(name.lower())
                out.append(name)
        if len(out) > 100:
            raise ValueError("Too many car types (max 100)")
        return out

    @field_validator("bank_accounts")
    @classmethod
    def accounts(cls, v: list[BankAccount] | None) -> list[BankAccount] | None:
        if v is None:
            return v
        if len(v) > 10:
            raise ValueError("At most 10 bank accounts")
        seen = set()
        for a in v:
            key = (a.bank_name.lower(), re.sub(r"\D", "", a.bank_account))
            if key in seen:
                raise ValueError(f"{a.bank_name} {a.bank_account} is listed twice")
            seen.add(key)
        # Exactly one default: the one marked, else the first.
        marked = [a for a in v if a.is_default]
        for i, a in enumerate(v):
            a.is_default = (a is marked[0]) if marked else i == 0
        return v
