import hashlib
import hmac
import logging

import requests
from app.core.config import settings

logger = logging.getLogger(__name__)


def _internal_headers(token: str) -> dict:
    """Bearer token plus the signed service header, so product-service returns
    real cost prices (needed for profit) even when the user is car-company
    staff who may not see them in the app."""
    sig = hmac.new(settings.SECRET_KEY.encode(), b"higoverse-internal-v1", hashlib.sha256).hexdigest()
    return {"Authorization": f"Bearer {token}", "X-Higoverse-Internal": sig}


def get_product(product_id: str, token: str) -> dict | None:
    try:
        res = requests.get(
            f"{settings.PRODUCT_SERVICE_URL}/products/{product_id}",
            headers=_internal_headers(token),
            timeout=10,
        )
        if res.ok:
            return res.json().get("data")
        logger.warning("product-service GET /products/%s returned %s", product_id, res.status_code)
    except Exception as e:
        logger.error("Failed to fetch product %s: %s", product_id, e)
    return None


def update_product_stock(product_id: str, new_quantity: int, product: dict, token: str) -> bool:
    try:
        # Only the quantity changes on a sale. Sending name/prices back would
        # risk overwriting them (e.g. with a value another request changed).
        payload = {"quantity": max(0, new_quantity)}

        res = requests.put(
            f"{settings.PRODUCT_SERVICE_URL}/products/{product_id}",
            json=payload,
            headers={**_internal_headers(token), "Content-Type": "application/json"},
            timeout=10,
        )
        if not res.ok:
            logger.warning("product-service PUT /products/%s returned %s: %s", product_id, res.status_code, res.text)
        return res.ok
    except Exception as e:
        logger.error("Failed to update stock for product %s: %s", product_id, e)
        return False
