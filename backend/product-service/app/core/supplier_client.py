import requests
from fastapi import HTTPException

SUPPLIER_SERVICE_URL = "http://127.0.0.1:8000"


def validate_supplier(supplier_id: str, shop_id: str, token: str):
    if not supplier_id:
        return

    try:
        res = requests.get(
            f"{SUPPLIER_SERVICE_URL}/suppliers/{supplier_id}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=5
        )

        if res.status_code != 200:
            raise HTTPException(status_code=400, detail="Supplier not found")

        supplier = res.json()["data"]

        if supplier["shop_id"] != shop_id:
            raise HTTPException(
                status_code=403,
                detail="Supplier does not belong to your shop"
            )

    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Supplier validation failed"
        )