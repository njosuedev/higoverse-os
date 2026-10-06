"""A company's identity details: phone and TIN.

Both are printed on proformas and receipts, so they're checked when saved:

- TIN (Rwanda Revenue Authority): exactly 9 digits.
- Phone: stored in international form (+250…). Rwandan numbers may be typed
  the local way (07X XXX XXXX) and must be a mobile (072/073/078/079) or a
  fixed line (02X); other countries need + and 8–15 digits.

Older shops kept their TIN inside the address text ("TIN:123456789|…");
`shop_tin()` still reads it there until a TIN is saved in its own field, so
no stored data needs rewriting.
"""
import re

_TIN = re.compile(r"^\d{9}$")
_ADDRESS_TIN = re.compile(r"^TIN:(\d{9})")


def clean_tin(value: str | None) -> str | None:
    """'' / None → None; otherwise the 9 digits, or ValueError."""
    if value is None:
        return None
    v = re.sub(r"[\s-]", "", str(value))
    if not v:
        return None
    if not _TIN.match(v):
        raise ValueError("TIN must be exactly 9 digits")
    return v


def clean_phone(value: str | None) -> str:
    """The phone in international form, or ValueError (it's required)."""
    raw = str(value or "").strip()
    if not raw:
        raise ValueError("Phone number is required")
    if not re.fullmatch(r"\+?[\d\s().-]+", raw):
        raise ValueError("Phone number may only contain digits, spaces and +")
    digits = re.sub(r"\D", "", raw)
    if raw.startswith("+"):
        intl = digits
    elif digits.startswith("250") and len(digits) == 12:
        intl = digits
    elif digits.startswith("0"):
        intl = "250" + digits[1:]
    else:
        intl = "250" + digits
    if intl.startswith("250"):
        local = intl[3:]
        if not re.fullmatch(r"(7[2389]\d{7}|2\d{8})", local):
            raise ValueError("Enter a valid Rwandan phone number, e.g. 0788 123 456")
    elif not 8 <= len(intl) <= 15:
        raise ValueError("Enter a valid phone number with its country code, e.g. +254 712 345 678")
    return "+" + intl


def shop_tin(shop) -> str | None:
    """The shop's TIN: its own field, else one kept in the address text."""
    if getattr(shop, "tin", None):
        return shop.tin
    m = _ADDRESS_TIN.match(getattr(shop, "address", None) or "")
    return m.group(1) if m else None
