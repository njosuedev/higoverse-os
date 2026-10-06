"""Customer, vehicle and bank details each have one home — Customers
(supplier-service), Vehicles (product-service) and Settings (settings-service).
A proforma only *points* at them; these helpers copy the current details in,
so nobody can change them from a proforma (or an older app that still sends
them). Approval takes the last copy and freezes it, as an issued document.
"""
import json
import logging

import requests
from fastapi import HTTPException

from app.core.config import settings
from app.core.product_client import get_product

logger = logging.getLogger(__name__)

# Built-in vehicle types (lib/business-layout.ts CAR_TYPES); a company's own
# types are printed as typed.
_CAR_TYPE_LABELS = {
    "sedan": "Sedan", "suv": "SUV", "pickup": "Pickup", "hatchback": "Hatchback", "van": "Van / Minibus",
    "bus": "Bus", "truck": "Truck", "coupe": "Coupe", "other": "Other",
}


def _get(url: str, token: str) -> dict | None:
    try:
        res = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=10)
        if res.ok:
            return res.json().get("data")
        logger.warning("GET %s returned %s", url, res.status_code)
    except Exception as e:
        logger.error("GET %s failed: %s", url, e)
    return None


def customer_fields(customer_id: str, token: str) -> dict:
    """The proforma's customer details, from the saved customer."""
    c = _get(f"{settings.SUPPLIER_SERVICE_URL}/suppliers/{customer_id}", token)
    if not c:
        raise HTTPException(status_code=400, detail="That customer no longer exists. Pick one from Customers.")
    return {
        "customer": c.get("name") or "",
        "customer_phone": c.get("phone") or "",
        "customer_email": c.get("email") or "",
        "customer_address": c.get("address") or "",
        "customer_id_no": c.get("id_number") or "",
        "customer_tin": c.get("tin") or "",
        "customer_company": c.get("company") or "",
        "customer_country": c.get("country") or "",
    }


def vehicle_line(line: dict, token: str) -> dict:
    """A proforma line with the vehicle's details taken from stock. The
    offered price and quantity stay as quoted."""
    product = get_product(line["product_id"], token)
    if not product:
        raise HTTPException(status_code=400, detail=f"{line.get('product_name') or 'A vehicle'} is no longer in stock.")
    try:
        a = json.loads(product.get("attributes") or "{}")
    except (TypeError, ValueError):
        a = {}
    a = a if isinstance(a, dict) else {}
    car_type = a.get("car_type") or ""
    return {
        **line,
        "product_name": product.get("name") or line.get("product_name") or "",
        "car_type": _CAR_TYPE_LABELS.get(car_type, car_type),
        "year": str(a.get("year") or ""),
        "color": a.get("color") or "",
        "chassis_no": a.get("chassis_no") or "",
        "plate_no": a.get("plate_no") or "",
        "mileage": str(a.get("mileage") or ""),
        "condition": a.get("condition") or "",
        "energy": a.get("energy") or ("Full electric" if a.get("battery_range") else ""),
    }


def bank_accounts(token: str) -> list[dict]:
    """The company's bank accounts (Settings → Bank accounts)."""
    s = _get(f"{settings.SETTINGS_SERVICE_URL}/settings/", token) or {}
    return [a for a in (s.get("bank_accounts") or []) if isinstance(a, dict)]


def bank_text(accounts: list[dict]) -> str:
    """As printed in the proforma's "Bank account" row, one account per line."""
    return "\n".join(
        f"{a.get('bank_name', '')} · Account No.: {a.get('bank_account', '')} · Account holder: {a.get('bank_holder', '')}"
        for a in accounts
    )
