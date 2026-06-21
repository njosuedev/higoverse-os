"""
Aggregates real-time shop data from all Higoverse microservices.
Every call is guarded — partial failures degrade gracefully.
Returns a rich, pre-computed context dict for the AI engine.
"""
from __future__ import annotations
import asyncio
from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.config import settings

TIMEOUT = httpx.Timeout(10.0)


async def _get(client: httpx.AsyncClient, url: str, headers: dict) -> Any:
    try:
        r = await client.get(url, headers=headers, timeout=TIMEOUT)
        if r.status_code == 200:
            body = r.json()
            return body.get("data", body)
    except Exception:
        pass
    return None


async def get_shop_info(token: str) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient() as client:
        data = await _get(client, f"{settings.AUTH_API}/api/v1/shop", headers)
        if data and isinstance(data, dict) and data.get("id"):
            return data
    return {}


async def gather_context(token: str) -> dict:
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

    async with httpx.AsyncClient() as client:
        (
            shop_data,
            sales_stats,
            sales_daily,
            recent_sales,
            products,
            expenses,
            reports,
            purchases,
            suppliers,
        ) = await asyncio.gather(
            _get(client, f"{settings.AUTH_API}/api/v1/shop", headers),
            _get(client, f"{settings.SALES_API}/sales/stats", headers),
            _get(client, f"{settings.SALES_API}/sales/stats/daily?days=30", headers),
            _get(client, f"{settings.SALES_API}/sales?limit=50", headers),
            _get(client, f"{settings.PRODUCTS_API}/items?limit=500", headers),
            _get(client, f"{settings.EXPENSES_API}/expenses?limit=100", headers),
            _get(client, f"{settings.REPORTS_API}/reports/summary", headers),
            _get(client, f"{settings.PURCHASES_API}/purchases?limit=50", headers),
            _get(client, f"{settings.SUPPLIERS_API}/suppliers?limit=200", headers),
            return_exceptions=True,
        )

    def safe(v):
        return v if not isinstance(v, Exception) else None

    shop_data    = safe(shop_data)   or {}
    sales_stats  = safe(sales_stats) or {}
    sales_daily  = safe(sales_daily) or []
    recent_sales = safe(recent_sales)or []
    products     = safe(products)    or []
    expenses     = safe(expenses)    or []
    reports      = safe(reports)     or {}
    purchases    = safe(purchases)   or []
    suppliers    = safe(suppliers)   or []

    # Normalise to lists
    if isinstance(recent_sales, dict): recent_sales = recent_sales.get("items", [])
    if isinstance(products,     dict): products     = products.get("items", [])
    if isinstance(expenses,     dict): expenses     = expenses.get("items", [])
    if isinstance(purchases,    dict): purchases    = purchases.get("items", [])
    if isinstance(suppliers,    dict): suppliers    = suppliers.get("items", [])
    if isinstance(sales_daily,  dict): sales_daily  = sales_daily.get("items", [])

    # ── INVENTORY ────────────────────────────────────────────────────
    items_list = [i for i in products if isinstance(i, dict)]

    low_stock = [
        {
            "name":       i.get("name", "?"),
            "qty":        i.get("quantity", 0),
            "restock_at": i.get("restock_level", i.get("min_stock", 5)),
            "price":      i.get("selling_price", i.get("price", 0)),
        }
        for i in items_list
        if i.get("quantity", 0) <= i.get("restock_level", i.get("min_stock", 5))
    ][:20]

    out_of_stock = [
        i.get("name", "?") for i in items_list if i.get("quantity", 0) == 0
    ][:15]

    top_by_value = sorted(
        [{"name":  i.get("name", "?"),
          "qty":   i.get("quantity", 0),
          "price": i.get("selling_price", i.get("price", 0)),
          "cost":  i.get("cost_price", i.get("purchase_price", 0))}
         for i in items_list],
        key=lambda x: x["qty"] * float(x["price"]), reverse=True
    )[:10]

    # Margin per product
    for p in top_by_value:
        try:
            sp, cp = float(p["price"]), float(p["cost"])
            p["margin_pct"] = round(((sp - cp) / sp) * 100, 1) if sp > 0 else 0
        except Exception:
            p["margin_pct"] = 0

    # All product names for AI awareness
    all_product_names = [i.get("name", "") for i in items_list if i.get("name")][:100]

    # ── EXPENSES ─────────────────────────────────────────────────────
    exp_list = [e for e in expenses if isinstance(e, dict)]
    total_expenses = sum(float(e.get("amount", 0)) for e in exp_list)

    expense_by_category: dict[str, float] = {}
    for e in exp_list:
        cat = e.get("category", "Other")
        expense_by_category[cat] = expense_by_category.get(cat, 0) + float(e.get("amount", 0))

    recent_expenses_detail = [
        {"description": e.get("description", e.get("name", "—")),
         "amount":      float(e.get("amount", 0)),
         "category":    e.get("category", "Other"),
         "date":        str(e.get("date", e.get("created_at", "—")))[:10]}
        for e in exp_list[:20]
    ]

    # ── SALES METRICS ────────────────────────────────────────────────
    stats = sales_stats if isinstance(sales_stats, dict) else {}
    revenue_today  = float(stats.get("revenue_today",  stats.get("today_revenue",  0)))
    revenue_week   = float(stats.get("revenue_week",   stats.get("week_revenue",   0)))
    revenue_month  = float(stats.get("revenue_month",  stats.get("month_revenue",  0)))
    sales_today    = int(stats.get("sales_today",      stats.get("today_count",    0)))
    sales_week     = int(stats.get("sales_week",       stats.get("week_count",     0)))
    sales_month    = int(stats.get("sales_month",      stats.get("month_count",    0)))

    avg_order_value = round(revenue_today / sales_today, 0) if sales_today > 0 else 0

    # Day-over-day trend from daily data
    daily_list = [d for d in sales_daily if isinstance(d, dict)]
    revenue_yesterday = 0.0
    revenue_trend_pct = 0.0
    if len(daily_list) >= 2:
        try:
            revenue_yesterday = float(daily_list[-2].get("revenue", 0))
            if revenue_yesterday > 0:
                revenue_trend_pct = round(
                    ((revenue_today - revenue_yesterday) / revenue_yesterday) * 100, 1
                )
        except Exception:
            pass

    # Best sales day in last 30 days
    best_day = None
    if daily_list:
        try:
            best_day = max(daily_list, key=lambda d: float(d.get("revenue", 0)))
        except Exception:
            pass

    # ── PURCHASES ────────────────────────────────────────────────────
    purchase_list = [p for p in purchases if isinstance(p, dict)]
    total_purchased = sum(float(p.get("total_amount", p.get("amount", p.get("total", 0)))) for p in purchase_list)

    # ── SUPPLIERS ────────────────────────────────────────────────────
    supplier_list = [s for s in suppliers if isinstance(s, dict)]
    supplier_names = [s.get("name", s.get("company_name", "—")) for s in supplier_list][:20]

    # ── PROFIT CALCULATION ───────────────────────────────────────────
    net_profit_month = round(revenue_month - total_expenses, 2)
    profit_margin    = round((net_profit_month / revenue_month * 100), 1) if revenue_month > 0 else 0
    gross_margin_est = round((revenue_today * 0.35), 2)  # ~35% gross estimate if no cost data

    now = datetime.now(timezone.utc)

    return {
        "generated_at": now.strftime("%Y-%m-%d %H:%M UTC"),
        "day_of_week":  now.strftime("%A"),
        "hour_utc":     now.hour,

        "shop": {
            "name":    shop_data.get("name",    "Your Shop"),
            "address": shop_data.get("address", "—"),
            "phone":   shop_data.get("phone",   "—"),
            "email":   shop_data.get("email",   "—"),
            "logo":    shop_data.get("logo_url",""),
        },

        "sales": {
            "stats": {
                "revenue_today":   revenue_today,
                "revenue_week":    revenue_week,
                "revenue_month":   revenue_month,
                "sales_today":     sales_today,
                "sales_week":      sales_week,
                "sales_month":     sales_month,
                "avg_order_value": avg_order_value,
                "revenue_yesterday":   revenue_yesterday,
                "revenue_trend_pct":   revenue_trend_pct,
            },
            "daily_30_days": daily_list[-30:],
            "recent_50":     recent_sales[:50],
            "best_day":      best_day,
        },

        "inventory": {
            "total_products":    len(items_list),
            "low_stock_items":   low_stock,
            "out_of_stock":      out_of_stock,
            "top_by_value":      top_by_value,
            "all_product_names": all_product_names,
            "total_stock_value": round(
                sum(float(i.get("qty", 0)) * float(i.get("price", 0)) for i in top_by_value), 2
            ),
        },

        "finances": {
            "reports_summary":        reports if isinstance(reports, dict) else {},
            "total_expenses_listed":  round(total_expenses, 2),
            "expenses_by_category":   expense_by_category,
            "recent_expenses":        recent_expenses_detail,
            "total_purchased":        round(total_purchased, 2),
            "net_profit_month":       net_profit_month,
            "profit_margin_pct":      profit_margin,
            "gross_margin_est_today": gross_margin_est,
        },

        "purchases": {
            "recent":        purchase_list[:20],
            "total_spent":   round(total_purchased, 2),
            "count":         len(purchase_list),
        },

        "partners": {
            "total_suppliers": len(supplier_list),
            "supplier_names":  supplier_names,
            "list_preview":    supplier_list[:10],
        },
    }
