import requests
from app.core.config import settings


def get_product(product_id: str, token: str) -> dict | None:
    try:
        res = requests.get(
            f"{settings.PRODUCT_SERVICE_URL}/products/{product_id}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=10,
        )
        if res.ok:
            return res.json().get("data")
    except Exception:
        pass
    return None


def update_product_stock(product_id: str, new_quantity: int, product: dict, token: str) -> bool:
    try:
        payload = {
            "name": product["name"],
            "cost_price": float(product["cost_price"]),
            "selling_price": float(product["selling_price"]),
            "quantity": max(0, new_quantity),
        }
        if product.get("supplier_id"):
            payload["supplier_id"] = product["supplier_id"]

        res = requests.put(
            f"{settings.PRODUCT_SERVICE_URL}/products/{product_id}",
            json=payload,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            timeout=10,
        )
        return res.ok
    except Exception:
        return False
