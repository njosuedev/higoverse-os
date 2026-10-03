import logging
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from fastapi import APIRouter, Depends
from app.core.security import require_financial_access
from app.core.config import settings

router = APIRouter(prefix="/reports", tags=["Reports"])
logger = logging.getLogger(__name__)

TIMEOUT = 5  # seconds per upstream call (keep well under Vercel's 10s limit)


def _call(url: str, token: str, params: dict = None) -> dict | list:
    """Call an upstream service. Returns empty dict/list on any failure."""
    try:
        res = requests.get(
            url,
            headers={"Authorization": f"Bearer {token}"},
            params=params,
            timeout=TIMEOUT,
        )
        if res.ok:
            return res.json().get("data", {})
        logger.warning("Upstream %s returned %s", url, res.status_code)
        return {}
    except Exception as e:
        logger.error("Upstream call failed %s: %s", url, e)
        return {}


def _parallel(*tasks):
    """Run (fn, *args) tasks in parallel and return results in order."""
    results: list = [{}] * len(tasks)
    with ThreadPoolExecutor(max_workers=len(tasks)) as pool:
        futures = {pool.submit(fn, *args): i for i, (fn, *args) in enumerate(tasks)}
        for future in as_completed(futures):
            try:
                results[futures[future]] = future.result()
            except Exception:
                results[futures[future]] = {}
    return results


# ─────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────

@router.get("/summary")
def get_summary(
    user: dict = Depends(require_financial_access),
    from_date: str | None = None,
    to_date: str | None = None,
    threshold: int = 10,  # the shop's Settings → low stock threshold
):
    token = user["_token"]
    date_params = {}
    if from_date:
        date_params["from_date"] = from_date
    if to_date:
        date_params["to_date"] = to_date

    # All 3 calls in parallel — total time = max(call time), not sum
    sales, purchases, products = _parallel(
        (_call, f"{settings.SALE_SERVICE_URL}/sales/summary", token, date_params),
        (_call, f"{settings.PURCHASE_SERVICE_URL}/purchases/summary", token, date_params),
        (_call, f"{settings.PRODUCT_SERVICE_URL}/products/summary", token, {"threshold": threshold}),
    )

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
    user: dict = Depends(require_financial_access),
    days: int = 14,
):
    token = user["_token"]
    data = _call(f"{settings.SALE_SERVICE_URL}/sales/daily", token, {"days": days})
    return {"success": True, "data": data if isinstance(data, list) else []}


# ─────────────────────────────────────────
# TOP SELLING ITEMS
# ─────────────────────────────────────────

@router.get("/top-items")
def get_top_items(
    user: dict = Depends(require_financial_access),
    limit: int = 10,
    from_date: str | None = None,
    to_date: str | None = None,
):
    token = user["_token"]
    params: dict = {"limit": limit}
    if from_date:
        params["from_date"] = from_date
    if to_date:
        params["to_date"] = to_date

    data = _call(f"{settings.SALE_SERVICE_URL}/sales/top-products", token, params)
    return {"success": True, "data": data if isinstance(data, list) else []}


# ─────────────────────────────────────────
# STOCK ALERTS
# ─────────────────────────────────────────

@router.get("/stock-alerts")
def get_stock_alerts(
    user: dict = Depends(require_financial_access),
    threshold: int = 10,  # the shop's Settings → low stock threshold
):
    token = user["_token"]
    data = _call(f"{settings.PRODUCT_SERVICE_URL}/products/stock-alerts", token, {"threshold": threshold})
    return {"success": True, "data": data if isinstance(data, list) else []}
