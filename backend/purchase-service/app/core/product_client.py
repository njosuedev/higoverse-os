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


def restock_product(product_id: str, qty_to_add: int, product: dict, token: str) -> bool:
    """Increment existing product stock by qty_to_add."""
    try:
        payload = {
            "name": product["name"],
            "cost_price": float(product["cost_price"]),
            "selling_price": float(product["selling_price"]),
            "quantity": product["quantity"] + qty_to_add,
        }
        if product.get("supplier_id"):
            payload["supplier_id"] = product["supplier_id"]

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
        logger.error("Failed to restock product %s: %s", product_id, e)
        return False


def create_product(
    name: str,
    cost_price: float,
    selling_price: float,
    quantity: int,
    supplier_id: str | None,
    description: str | None,
    token: str,
) -> dict | None:
    """Create a brand-new product and return its data."""
    try:
        payload = {
            "name": name,
            "cost_price": cost_price,
            "selling_price": selling_price or cost_price,
            "quantity": quantity,
            "supplier_id": supplier_id,
            "description": description,
        }
        res = requests.post(
            f"{settings.PRODUCT_SERVICE_URL}/products/",
            json=payload,
            headers={**_internal_headers(token), "Content-Type": "application/json"},
            timeout=10,
        )
        if res.ok:
            return res.json().get("data")
        logger.warning("product-service POST /products returned %s: %s", res.status_code, res.text)
    except Exception as e:
        logger.error("Failed to create product '%s': %s", name, e)
    return None
