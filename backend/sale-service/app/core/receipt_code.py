"""The code in a printed receipt's QR: "HGV1.R.<sale id>.<signature>".

It says nothing by itself (no business, no amounts): only Higoverse can tell
what it is. The signature is an HMAC of the business and the sale with a key
derived from the server's secret, so a code can't be made up or pointed at
another sale, and it is only valid inside the business that printed it.
"""
import hashlib
import hmac

from app.core.config import settings

PREFIX = "HGV1.R."
_KEY = hashlib.sha256(f"higoverse-receipt|{settings.SECRET_KEY}".encode()).digest()


def _sign(shop_id: str, sale_id: str) -> str:
    return hmac.new(_KEY, f"{shop_id}|{sale_id}".encode(), hashlib.sha256).hexdigest()[:20]


def make(shop_id: str, sale_id: str) -> str:
    return f"{PREFIX}{sale_id}.{_sign(shop_id, sale_id)}"


def sale_id_of(code: str, shop_id: str) -> str | None:
    """The sale a code points to, if it is genuine and from this business."""
    code = (code or "").strip()
    if not code.startswith(PREFIX):
        return None
    sale_id, _, sig = code[len(PREFIX):].rpartition(".")
    if not sale_id or not sig or len(sale_id) > 64:
        return None
    return sale_id if hmac.compare_digest(sig, _sign(shop_id, sale_id)) else None
