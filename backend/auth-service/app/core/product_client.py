import logging

import requests

from app.core.config import settings

logger = logging.getLogger(__name__)


def sync_shop_status(shop_id: str, is_active: bool) -> None:
    """Best-effort push of a shop's is_active flag to product-service, which
    keeps a denormalized `shop_is_active` column on each of that shop's
    products (no live cross-database join is possible — see
    Product.shop_is_active in product-service).

    Failures are logged and swallowed: this is an eventual-consistency sync,
    not a transactional guarantee. A shop toggle should never fail just
    because product-service is briefly unreachable.
    """
    if not settings.INTERNAL_SERVICE_SECRET:
        logger.warning("INTERNAL_SERVICE_SECRET not set — skipping shop status sync for shop_id=%s", shop_id)
        return

    try:
        response = requests.patch(
            f"{settings.PRODUCT_SERVICE_URL}/internal/shops/{shop_id}/status",
            json={"is_active": is_active},
            headers={"X-Internal-Secret": settings.INTERNAL_SERVICE_SECRET},
            timeout=5,
        )
        if response.status_code != 200:
            logger.error(
                "Shop status sync failed for shop_id=%s: product-service returned %s",
                shop_id, response.status_code,
            )
    except Exception as e:
        logger.error("Shop status sync failed for shop_id=%s: %s", shop_id, e)
