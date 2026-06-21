"""
Aggregates real shop data from existing microservices.
Every call is guarded — partial failures degrade gracefully.
"""
from __future__ import annotations
import asyncio
from datetime import datetime, timezone
from typing import Any

import httpx

from app.core.config import settings

TIMEOUT = httpx.Timeout(8.0)
_LANG_NAMES = {"en": "English", "rw": "Kinyarwanda", "fr": "French", "sw": "Swahili"}


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
    """Fetch shop profile from auth service."""
    headers = {"Authorization": f"Bearer {token}"}
    async with httpx.AsyncClient() as client:
        data = await _get(client, f"{settings.AUTH_API}/api/v1/shop", headers)
        if data and isinstance(data, dict) and data.get("id"):
            return data
    return {}


async def gather_context(token: str) -> dict:
    """Fetch data from all services concurrently and build a structured context dict."""
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
            _get(client, f"{settings.SALES_API}/sales/stats/daily?days=14", headers),
            _get(client, f"{settings.SALES_API}/sales?limit=20", headers),
            _get(client, f"{settings.PRODUCTS_API}/items?limit=200", headers),
            _get(client, f"{settings.EXPENSES_API}/expenses?limit=50", headers),
            _get(client, f"{settings.REPORTS_API}/reports/summary", headers),
            _get(client, f"{settings.PURCHASES_API}/purchases?limit=20", headers),
            _get(client, f"{settings.SUPPLIERS_API}/suppliers?limit=100", headers),
            return_exceptions=True,
        )

    # ── Normalise ───────────────────────────────────────────────────
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

    # Ensure lists
    if isinstance(recent_sales, dict): recent_sales = recent_sales.get("items", [recent_sales])
    if isinstance(products,     dict): products     = products.get("items",       [products])
    if isinstance(expenses,     dict): expenses     = expenses.get("items",       [expenses])
    if isinstance(purchases,    dict): purchases    = purchases.get("items",      [purchases])
    if isinstance(suppliers,    dict): suppliers    = suppliers.get("items",      [suppliers])
    if isinstance(sales_daily,  dict): sales_daily  = sales_daily.get("items",   [sales_daily])

    # ── Inventory analysis ──────────────────────────────────────────
    items_list = products if isinstance(products, list) else []
    low_stock = [
        {"name": i.get("name", "?"), "qty": i.get("quantity", 0),
         "restock_at": i.get("restock_level", i.get("min_stock", 5))}
        for i in items_list
        if isinstance(i, dict) and i.get("quantity", 0) <= i.get("restock_level", i.get("min_stock", 5))
    ][:15]

    out_of_stock = [
        i.get("name", "?") for i in items_list
        if isinstance(i, dict) and i.get("quantity", 0) == 0
    ][:10]

    top_by_value = sorted(
        [{"name": i.get("name","?"), "qty": i.get("quantity",0),
          "price": i.get("selling_price", i.get("price", 0))}
         for i in items_list if isinstance(i, dict)],
        key=lambda x: x["qty"] * x["price"], reverse=True
    )[:10]

    # ── Expense totals ──────────────────────────────────────────────
    exp_list = expenses if isinstance(expenses, list) else []
    total_expenses = sum(
        float(e.get("amount", 0)) for e in exp_list if isinstance(e, dict)
    )
    expense_by_category: dict[str, float] = {}
    for e in exp_list:
        if isinstance(e, dict):
            cat = e.get("category", "Other")
            expense_by_category[cat] = expense_by_category.get(cat, 0) + float(e.get("amount", 0))

    # ── Build context ───────────────────────────────────────────────
    return {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "shop": {
            "name":    shop_data.get("name",    "Your Shop"),
            "address": shop_data.get("address", "—"),
            "phone":   shop_data.get("phone",   "—"),
            "email":   shop_data.get("email",   "—"),
        },
        "sales": {
            "stats":           sales_stats if isinstance(sales_stats, dict) else {},
            "daily_14_days":   sales_daily  if isinstance(sales_daily, list)  else [],
            "recent_20":       (recent_sales if isinstance(recent_sales, list) else [])[:20],
        },
        "inventory": {
            "total_products":  len(items_list),
            "low_stock_items": low_stock,
            "out_of_stock":    out_of_stock,
            "top_by_value":    top_by_value,
        },
        "finances": {
            "reports_summary":      reports if isinstance(reports, dict) else {},
            "total_expenses_listed": round(total_expenses, 2),
            "expenses_by_category": expense_by_category,
            "recent_expenses":      exp_list[:15],
        },
        "purchases": {
            "recent": (purchases if isinstance(purchases, list) else [])[:15],
        },
        "partners": {
            "total_suppliers": len(suppliers if isinstance(suppliers, list) else []),
            "list_preview":    (suppliers if isinstance(suppliers, list) else [])[:10],
        },
    }


def build_system_prompt(context: dict, shop_name: str, language: str) -> str:
    lang_name = _LANG_NAMES.get(language, "English")
    ctx_json  = json.dumps(context, indent=2, default=str, ensure_ascii=False)

    return f"""You are an expert AI Business Advisor for "{shop_name}", a shop managed on the Higoverse platform.

CRITICAL RULES:
1. ONLY use the business data provided in SHOP DATA SNAPSHOT below. NEVER invent numbers.
2. Mark data-backed facts with 📊 and recommendations with 💡.
3. If data is unavailable for a question, say so honestly and explain what you can see.
4. Respond ENTIRELY in {lang_name} (language code: {language}).
5. Use emojis, bullet points and clear section headers for readability.
6. Always include specific numbers (amounts in RWF, counts, percentages).
7. End every response with a "⚡ Next Steps" section with 2-3 concrete actions the owner can take today.
8. Keep responses concise but complete — aim for 300-500 words unless a full report is requested.

SHOP DATA SNAPSHOT (Generated: {context.get('generated_at', 'now')}):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{ctx_json}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When analyzing:
• Sales questions → use sales.stats and sales.daily_14_days
• Inventory questions → use inventory section (low_stock_items, out_of_stock)
• Financial questions → use finances section (expenses, reports_summary)
• Growth questions → compare trends and identify top performers
• Predictions → clearly label as estimates based on current trends

Business currency: RWF (Rwandan Franc). Format large numbers with commas.
"""
