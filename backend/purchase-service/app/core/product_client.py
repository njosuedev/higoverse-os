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
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            timeout=10,
        )
        return res.ok
    except Exception:
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
            f"{settings.PRODUCT_SERVICE_URL}/products",
            json=payload,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            timeout=10,
        )
        if res.ok:
            return res.json().get("data")
    except Exception:
        pass
    return None
