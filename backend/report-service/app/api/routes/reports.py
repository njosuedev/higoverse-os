import requests
from fastapi import APIRouter, Depends, HTTPException
from app.core.security import get_current_user
from app.core.config import settings

router = APIRouter(prefix="/reports", tags=["Reports"])


def _call(url: str, token: str, params: dict = None) -> dict:
    try:
        res = requests.get(
            url,
            headers={"Authorization": f"Bearer {token}"},
            params=params,
            timeout=10,
        )
        res.raise_for_status()
        return res.json().get("data", {})
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Upstream service error: {e}")


# ─────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────

@router.get("/summary")
def get_summary(
    user: dict = Depends(get_current_user),
    from_date: str | None = None,
    to_date: str | None = None,
):
    token = user["_token"]
    date_params = {}
    if from_date:
        date_params["from_date"] = from_date
    if to_date:
        date_params["to_date"] = to_date

    sales = _call(f"{settings.SALE_SERVICE_URL}/sales/summary", token, date_params)
    purchases = _call(f"{settings.PURCHASE_SERVICE_URL}/purchases/summary", token, date_params)
    products = _call(f"{settings.PRODUCT_SERVICE_URL}/products/summary", token)

    return {
        "success": True,
        "data": {
            "revenue": sales.get("revenue", 0),
            "profit": sales.get("profit", 0),
            "items_sold": sales.get("items_sold", 0),
            "sales_count": sales.get("sales_count", 0),
            "unique_customers": sales.get("unique_customers", 0),
            "total_spent": purchases.get("total_spent", 0),
            "stock_value": products.get("stock_value", 0),
            "potential_profit": products.get("potential_profit", 0),
            "total_products": products.get("total_products", 0),
            "out_of_stock": products.get("out_of_stock", 0),
            "low_stock": products.get("low_stock", 0),
        },
    }


# ─────────────────────────────────────────
# DAILY BREAKDOWN
# ─────────────────────────────────────────

@router.get("/daily")
def get_daily(
    user: dict = Depends(get_current_user),
    days: int = 14,
):
    token = user["_token"]
    data = _call(f"{settings.SALE_SERVICE_URL}/sales/daily", token, {"days": days})
    return {"success": True, "data": data}


# ─────────────────────────────────────────
# TOP SELLING ITEMS
# ─────────────────────────────────────────

@router.get("/top-items")
def get_top_items(
    user: dict = Depends(get_current_user),
    limit: int = 10,
    from_date: str | None = None,
    to_date: str | None = None,
):
    token = user["_token"]
    params = {"limit": limit}
    if from_date:
        params["from_date"] = from_date
    if to_date:
        params["to_date"] = to_date

    data = _call(f"{settings.SALE_SERVICE_URL}/sales/top-products", token, params)
    return {"success": True, "data": data}


# ─────────────────────────────────────────
# STOCK ALERTS
# ─────────────────────────────────────────

@router.get("/stock-alerts")
def get_stock_alerts(
    user: dict = Depends(get_current_user),
):
    token = user["_token"]
    data = _call(f"{settings.PRODUCT_SERVICE_URL}/products/stock-alerts", token)
    return {"success": True, "data": data}
