"""The code in the QR of every document Higoverse prints:
"HGV1.<kind>.<id>.<signature>".

It says nothing by itself (no business, no amounts): only Higoverse can tell
what it is. The signature is an HMAC of the kind, the business and the
document with a key derived from the server's secret, so a code can't be made
up or pointed at another document, and it is only valid inside the business
that printed it. The same file is in sale-service and expense-service.

Kinds: R sale receipt, P proforma (sale-service); S pay slip (an employee's
month, paid or not), A salary advance, M a month's payroll sheet
(expense-service).
"""
import hashlib
import hmac
import re

from app.core.config import settings

PREFIX = "HGV1."
_KEY = hashlib.sha256(f"higoverse-receipt|{settings.SECRET_KEY}".encode()).digest()
_ID = re.compile(r"^[A-Za-z0-9_-]{1,80}$")


def _sign(kind: str, shop_id: str, doc_id: str) -> str:
    # Receipts were printed before the other kinds, without the kind.
    msg = f"{shop_id}|{doc_id}" if kind == "R" else f"{kind}|{shop_id}|{doc_id}"
    return hmac.new(_KEY, msg.encode(), hashlib.sha256).hexdigest()[:20]


def make(kind: str, shop_id: str, doc_id: str) -> str:
    return f"{PREFIX}{kind}.{doc_id}.{_sign(kind, shop_id, doc_id)}"


def parse(code: str, shop_id: str) -> tuple[str, str] | None:
    """(kind, id) of a code, if it is genuine and from this business."""
    parts = (code or "").strip().split(".")
    if len(parts) != 4 or f"{parts[0]}." != PREFIX:
        return None
    _, kind, doc_id, sig = parts
    if len(kind) != 1 or not _ID.match(doc_id):
        return None
    return (kind, doc_id) if hmac.compare_digest(sig, _sign(kind, shop_id, doc_id)) else None
