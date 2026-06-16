import logging
import requests
from fastapi import HTTPException

from app.core.config import settings

logger = logging.getLogger(__name__)


def validate_supplier(
    supplier_id: str,
    shop_id: str,
    token: str
):
    if not supplier_id:
        return

    try:
        response = requests.get(
            f"{settings.SUPPLIER_SERVICE_URL}/suppliers/{supplier_id}",
            headers={
                "Authorization": f"Bearer {token}"
            },
            timeout=10
        )

        if response.status_code != 200:
            raise HTTPException(
                status_code=400,
                detail=f"Supplier service returned {response.status_code}"
            )

        data = response.json()

        if not data.get("success"):
            raise HTTPException(
                status_code=400,
                detail="Supplier lookup failed"
            )

        supplier = data["data"]

        if supplier.get("shop_id") != shop_id:
            raise HTTPException(
                status_code=403,
                detail="Supplier does not belong to your shop"
            )

        return supplier

    except HTTPException:
        raise

    except Exception as e:
        logger.error("Supplier validation failed for supplier_id=%s: %s", supplier_id, e)
        raise HTTPException(
            status_code=400,
            detail=f"Supplier validation failed: {str(e)}"
        )