import logging
import requests
from app.core.config import settings

logger = logging.getLogger(__name__)


def get_marketplace_product(product_id: str) -> dict | None:
    # Public, unauthenticated marketplace lookup — a customer placing an
    # order has no shop_id, so the normal shop-scoped GET /products/{id}
    # route (which requires a shop-owner JWT) can't be used here. This
    # endpoint prefix-matches id_prefix against Product.id, so passing the
    # full UUID gives an exact-match lookup.
    try:
        res = requests.get(
            f"{settings.PRODUCT_SERVICE_URL}/products/marketplace/by-id/{product_id}",
            timeout=10,
        )
        if res.ok:
            return res.json().get("data")
        logger.warning(
            "product-service GET /products/marketplace/by-id/%s returned %s",
            product_id, res.status_code,
        )
    except Exception as e:
        logger.error("Failed to fetch marketplace product %s: %s", product_id, e)
    return None


def adjust_stock(product_id: str, delta: int) -> bool:
    # Positive delta restores stock (order cancelled), negative decrements it
    # (order placed). Uses the shared internal secret instead of a user JWT,
    # since neither a customer nor order-service holds a shop-owner token.
    try:
        res = requests.post(
            f"{settings.PRODUCT_SERVICE_URL}/internal/products/{product_id}/adjust-stock",
            json={"delta": delta},
            headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            timeout=10,
        )
        if not res.ok:
            logger.warning(
                "product-service adjust-stock %s (delta=%s) returned %s: %s",
                product_id, delta, res.status_code, res.text,
            )
        return res.ok
    except Exception as e:
        logger.error("Failed to adjust stock for product %s: %s", product_id, e)
        return False
