"""
Standalone AI Business Advisor Engine.
No external AI API. Uses intent detection + real shop data + response templates.
Supports: English, Kinyarwanda, French, Swahili.
"""
from __future__ import annotations
import re
import time
from datetime import datetime, timezone
from typing import Any

# ── Intent keywords per language ────────────────────────────────────────────

_INTENTS = {
    "performance": [
        "performance", "how is", "how am i", "doing today", "summary", "overview",
        "status", "business today", "shop today", "how are", "situation",
        # rw
        "imiterere", "uko bigenze", "incamake", "uyu munsi",
        # fr
        "performance", "comment va", "résumé", "bilan", "aujourd'hui",
        # sw
        "utendaji", "jinsi", "muhtasari", "leo",
    ],
    "inventory": [
        "stock", "inventory", "restock", "low", "out of", "product", "item",
        "running out", "empty", "shortage", "refill", "quantity",
        # rw
        "ububiko", "ibicuruzwa", "birangiye", "bikenewe", "kuzuza",
        # fr
        "inventaire", "stock", "réapprovisionner", "rupture", "articles",
        # sw
        "akiba", "bidhaa", "imalizika", "kujaza", "stoo",
    ],
    "financial": [
        "revenue", "profit", "expense", "cost", "money", "income", "loss",
        "earning", "spending", "financial", "finance", "cash",
        # rw
        "amafaranga", "inyungu", "igiciro", "umusaruro", "ibyaguriye",
        # fr
        "revenu", "profit", "dépense", "coût", "argent", "bénéfice", "perte",
        # sw
        "mapato", "faida", "gharama", "pesa", "hasara", "fedha",
    ],
    "sales": [
        "sale", "sales", "transaction", "sold", "customer", "order", "recent",
        "today sale", "sell",
        # rw
        "amagurishwa", "igurisha", "abakiriya", "ibicuruzwa byagurishijwe",
        # fr
        "vente", "ventes", "transaction", "vendu", "client", "commande",
        # sw
        "mauzo", "uuzaji", "muamala", "aliyeuza", "wateja",
    ],
    "growth": [
        "grow", "growth", "improve", "best product", "top product", "opportunity",
        "increase", "focus", "strategy", "recommend", "suggestion", "advice",
        # rw
        "gutera imbere", "ibicuruzwa byiza", "inama", "ingenzi",
        # fr
        "croissance", "meilleur produit", "améliorer", "opportunité", "conseil",
        # sw
        "ukuaji", "bidhaa bora", "kuboresha", "fursa", "ushauri",
    ],
    "purchases": [
        "purchase", "bought", "supplier", "buying", "reorder", "procurement",
        # rw
        "ibigurwa", "abaganishi", "kugura",
        # fr
        "achat", "fournisseur", "approvisionnement",
        # sw
        "manunuzi", "wasambazaji", "kununua",
    ],
    "report": [
        "report", "full report", "complete", "everything", "all data", "detailed",
        "generate report", "monthly report", "weekly report",
        # rw
        "raporo", "raporo yose", "byose",
        # fr
        "rapport", "rapport complet", "tout",
        # sw
        "ripoti", "ripoti kamili", "kila kitu",
    ],
}

# ── Formatters ────────────────────────────────────────────────────────────────

def _fmt_rwf(amount: Any) -> str:
    try:
        return f"{float(amount):,.0f} RWF"
    except Exception:
        return "N/A"


def _pct_change(current: float, previous: float) -> str:
    if previous == 0:
        return "N/A"
    pct = ((current - previous) / previous) * 100
    arrow = "▲" if pct >= 0 else "▼"
    return f"{arrow} {abs(pct):.1f}%"


def _detect_intent(message: str) -> str:
    lower = message.lower()
    scores: dict[str, int] = {k: 0 for k in _INTENTS}
    for intent, keywords in _INTENTS.items():
        for kw in keywords:
            if kw in lower:
                scores[intent] += 1
    best = max(scores, key=lambda k: scores[k])
    return best if scores[best] > 0 else "performance"


# ── Response builders ─────────────────────────────────────────────────────────

def _build_performance(ctx: dict, lang: str) -> str:
    shop      = ctx.get("shop", {})
    sales     = ctx.get("sales", {})
    stats     = sales.get("stats", {})
    finances  = ctx.get("finances", {})
    inventory = ctx.get("inventory", {})
    daily     = sales.get("daily_14_days", [])

    shop_name     = shop.get("name", "Your Shop")
    revenue_today = stats.get("revenue_today", stats.get("today_revenue", 0))
    sales_today   = stats.get("sales_today",   stats.get("today_count",   0))
    revenue_month = stats.get("revenue_month", stats.get("month_revenue", 0))
    profit_est    = float(revenue_today) * 0.3
    expense_total = finances.get("total_expenses_listed", 0)
    low_stock_cnt = len(inventory.get("low_stock_items", []))
    total_prods   = inventory.get("total_products", 0)

    # Trend from daily data
    trend_note = ""
    if isinstance(daily, list) and len(daily) >= 2:
        try:
            last   = float(daily[-1].get("revenue", 0))
            before = float(daily[-2].get("revenue", 0))
            pct    = _pct_change(last, before)
            trend_note = f"\n• Sales trend vs yesterday: {pct}"
        except Exception:
            pass

    if lang == "rw":
        return f"""📊 Incamake y'Ubucuruzi — {shop_name}
━━━━━━━━━━━━━━━━━━━━━━━━━

💰 Amafaranga Yinjiye Uyu Munsi: {_fmt_rwf(revenue_today)}
🛒 Amagurishwa Uyu Munsi: {sales_today}
📅 Amafaranga y'Uku Kwezi: {_fmt_rwf(revenue_month)}
💡 Inyungu Yibazwa (~30%): {_fmt_rwf(profit_est)}
📦 Ibicuruzwa Muri Ububiko: {total_prods}
⚠️ Ibicuruzwa Bikenewe Kuzuzwa: {low_stock_cnt}{trend_note}

📊 IBIKURIKIRA BY'UKURI:
• Amafaranga yose yaguriyemo yanditswe: {_fmt_rwf(expense_total)}
• Inyungu nyayo ifatwa nk'amafaranga yinjiye ahagaze amafaranga yaguriyemo

⚡ Ibikorwa Bikurikira:
1. {"Zuza ububiko bw'ibicuruzwa " + str(low_stock_cnt) + " bikenewe" if low_stock_cnt > 0 else "Ububiko bwose buri mwanya — komeza gutanga"}
2. Reba amagurishwa y'uku kwezi ugereranye n'ukwezi gushize
3. Suzuma amafaranga yaguriyemo ushake aho ushobora kuzigama"""

    if lang == "fr":
        return f"""📊 Résumé Commercial — {shop_name}
━━━━━━━━━━━━━━━━━━━━━━━━━

💰 Revenu Aujourd'hui: {_fmt_rwf(revenue_today)}
🛒 Ventes Aujourd'hui: {sales_today}
📅 Revenu du Mois: {_fmt_rwf(revenue_month)}
💡 Bénéfice Estimé (~30%): {_fmt_rwf(profit_est)}
📦 Produits en Stock: {total_prods}
⚠️ Articles à Réapprovisionner: {low_stock_cnt}{trend_note}

📊 FAITS VÉRIFIÉS:
• Total dépenses enregistrées: {_fmt_rwf(expense_total)}
• Le bénéfice net = Revenu − Dépenses

⚡ Prochaines Étapes:
1. {"Réapprovisionnez " + str(low_stock_cnt) + " article(s) en rupture" if low_stock_cnt > 0 else "Tous les stocks sont sains — continuez ainsi"}
2. Comparez les ventes mensuelles avec le mois précédent
3. Analysez vos dépenses pour identifier des économies possibles"""

    if lang == "sw":
        return f"""📊 Muhtasari wa Biashara — {shop_name}
━━━━━━━━━━━━━━━━━━━━━━━━━

💰 Mapato Leo: {_fmt_rwf(revenue_today)}
🛒 Mauzo Leo: {sales_today}
📅 Mapato ya Mwezi: {_fmt_rwf(revenue_month)}
💡 Faida Inayokadiriwa (~30%): {_fmt_rwf(profit_est)}
📦 Bidhaa Zilizopo: {total_prods}
⚠️ Bidhaa Zinazohitaji Kujazwa: {low_stock_cnt}{trend_note}

📊 UKWELI ULIOTHIBITISHWA:
• Jumla ya gharama zilizorekodiwa: {_fmt_rwf(expense_total)}
• Faida halisi = Mapato − Gharama

⚡ Hatua Zinazofuata:
1. {"Jaza akiba ya bidhaa " + str(low_stock_cnt) + " zinazokwisha" if low_stock_cnt > 0 else "Akiba zote ziko sawa — endelea hivyo"}
2. Linganisha mauzo ya mwezi huu na mwezi uliopita
3. Kagua gharama zako ili kupata uokoaji"""

    # English (default)
    return f"""📊 Business Performance Summary — {shop_name}
━━━━━━━━━━━━━━━━━━━━━━━━━

💰 Revenue Today: {_fmt_rwf(revenue_today)}
🛒 Sales Today: {sales_today} orders
📅 Revenue This Month: {_fmt_rwf(revenue_month)}
💡 Estimated Profit (~30%): {_fmt_rwf(profit_est)}
📦 Products in Inventory: {total_prods}
⚠️ Items Needing Restock: {low_stock_cnt}{trend_note}

📊 VERIFIED FACTS:
• Total recorded expenses: {_fmt_rwf(expense_total)}
• Net profit = Revenue − All expenses

⚡ Next Steps:
1. {"Restock " + str(low_stock_cnt) + " low-stock item(s) urgently" if low_stock_cnt > 0 else "All stock levels are healthy — keep it up"}
2. Compare this month's sales to last month for trend analysis
3. Review your top expense categories for potential savings"""


def _build_inventory(ctx: dict, lang: str) -> str:
    inventory = ctx.get("inventory", {})
    low       = inventory.get("low_stock_items", [])
    out       = inventory.get("out_of_stock", [])
    top       = inventory.get("top_by_value", [])
    total     = inventory.get("total_products", 0)

    def low_lines():
        if not low:
            return "  ✅ No items below restock level"
        return "\n".join(
            f"  • {i.get('name','?')}: {i.get('qty',0)} units left (restock at {i.get('restock_at',0)})"
            for i in low[:10]
        )

    def out_lines():
        if not out:
            return "  ✅ None"
        return "  • " + "\n  • ".join(out[:8])

    def top_lines():
        if not top:
            return "  No data"
        return "\n".join(
            f"  {idx+1}. {i.get('name','?')} — {i.get('qty',0)} units @ {_fmt_rwf(i.get('price',0))}"
            for idx, i in enumerate(top[:5])
        )

    if lang == "rw":
        return f"""📦 Isesengura ry'Ububiko
━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Ibicuruzwa Byose: {total}
⚠️ Bikenewe Kuzuzwa ({len(low)}):
{low_lines()}

🚫 Birangiye Burundu ({len(out)}):
{out_lines()}

🏆 Ibicuruzwa Bifite Agaciro Gakomeye:
{top_lines()}

⚡ Ibikorwa Bikurikira:
1. Zuza ibicuruzwa birangiye cyangwa bikenewe kuzuzwa vuba
2. Kora amasoko ku bigendera neza kugira ngo bigume bifite
3. Suzuma ibicuruzwa bidagurishwa bireba kuyavanaho"""

    if lang == "fr":
        return f"""📦 Analyse de l'Inventaire
━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Total Produits: {total}
⚠️ À Réapprovisionner ({len(low)}):
{low_lines()}

🚫 En Rupture de Stock ({len(out)}):
{out_lines()}

🏆 Top Produits par Valeur:
{top_lines()}

⚡ Prochaines Étapes:
1. Réapprovisionnez immédiatement les articles en rupture
2. Commandez les articles sous le seuil minimal
3. Étudiez les articles qui ne se vendent pas pour les éliminer"""

    if lang == "sw":
        return f"""📦 Uchambuzi wa Akiba
━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Jumla ya Bidhaa: {total}
⚠️ Zinahitaji Kujazwa ({len(low)}):
{low_lines()}

🚫 Zimeisha Kabisa ({len(out)}):
{out_lines()}

🏆 Bidhaa Bora kwa Thamani:
{top_lines()}

⚡ Hatua Zinazofuata:
1. Jaza mara moja bidhaa zilizoisha
2. Agiza bidhaa zilizo chini ya kiwango cha chini
3. Kagua bidhaa ambazo hazinunuliwi na uziondoe"""

    return f"""📦 Inventory Intelligence Report
━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Total Products: {total}
⚠️ Low Stock / Needs Restock ({len(low)}):
{low_lines()}

🚫 Out of Stock ({len(out)}):
{out_lines()}

🏆 Top Products by Stock Value:
{top_lines()}

⚡ Next Steps:
1. Restock out-of-stock items immediately to avoid lost sales
2. Place orders for items below their restock threshold
3. Review slow-moving products — consider promotions or removing them"""


def _build_financial(ctx: dict, lang: str) -> str:
    sales    = ctx.get("sales", {})
    stats    = sales.get("stats", {})
    finances = ctx.get("finances", {})

    revenue_today  = stats.get("revenue_today",  stats.get("today_revenue",  0))
    revenue_month  = stats.get("revenue_month",  stats.get("month_revenue",  0))
    expense_total  = finances.get("total_expenses_listed", 0)
    by_cat         = finances.get("expenses_by_category", {})
    recent_exp     = finances.get("recent_expenses", [])
    net_profit     = float(revenue_month) - float(expense_total)
    margin         = (net_profit / float(revenue_month) * 100) if float(revenue_month) > 0 else 0

    def cat_lines():
        if not by_cat:
            return "  No expense breakdown available"
        sorted_cats = sorted(by_cat.items(), key=lambda x: x[1], reverse=True)
        return "\n".join(f"  • {cat}: {_fmt_rwf(amt)}" for cat, amt in sorted_cats[:6])

    if lang == "rw":
        return f"""💰 Isesengura ry'Imari
━━━━━━━━━━━━━━━━━━━━━━━━━

📊 UKURI:
• Amafaranga Yinjiye Uyu Munsi: {_fmt_rwf(revenue_today)}
• Amafaranga Yinjiye Uku Kwezi: {_fmt_rwf(revenue_month)}
• Amafaranga Yaguriyemo (yanditswe): {_fmt_rwf(expense_total)}
• Inyungu Nyayo y'Ukwezi: {_fmt_rwf(net_profit)}
• Igenga ry'Inyungu: {margin:.1f}%

📂 Amafaranga Yaguriyemo Hakurikijwe Inzego:
{cat_lines()}

⚡ Ibikorwa Bikurikira:
1. {"Inyungu ni nziza — komeza kugenzura amafaranga yaguriyemo" if net_profit > 0 else "⚠️ Igiciro kirenze — ongesha amagurishwa cyangwa menge amafaranga yaguriyemo"}
2. Reba inzego zifite amafaranga menshi — urebe aho ushobora kuzigama
3. Jya wandika amafaranga yose yaguriyemo buri munsi"""

    if lang == "fr":
        return f"""💰 Analyse Financière
━━━━━━━━━━━━━━━━━━━━━━━━━

📊 FAITS VÉRIFIÉS:
• Revenu Aujourd'hui: {_fmt_rwf(revenue_today)}
• Revenu du Mois: {_fmt_rwf(revenue_month)}
• Dépenses Enregistrées: {_fmt_rwf(expense_total)}
• Bénéfice Net du Mois: {_fmt_rwf(net_profit)}
• Marge Bénéficiaire: {margin:.1f}%

📂 Dépenses par Catégorie:
{cat_lines()}

⚡ Prochaines Étapes:
1. {"Bonne marge — continuez à surveiller les coûts" if net_profit > 0 else "⚠️ Perte nette — augmentez les ventes ou réduisez les dépenses"}
2. La catégorie la plus coûteuse mérite un examen approfondi
3. Enregistrez toutes les dépenses quotidiennement pour un suivi précis"""

    if lang == "sw":
        return f"""💰 Uchambuzi wa Fedha
━━━━━━━━━━━━━━━━━━━━━━━━━

📊 UKWELI ULIOTHIBITISHWA:
• Mapato Leo: {_fmt_rwf(revenue_today)}
• Mapato ya Mwezi: {_fmt_rwf(revenue_month)}
• Gharama Zilizorekodiwa: {_fmt_rwf(expense_total)}
• Faida Halisi ya Mwezi: {_fmt_rwf(net_profit)}
• Asilimia ya Faida: {margin:.1f}%

📂 Gharama kwa Kitengo:
{cat_lines()}

⚡ Hatua Zinazofuata:
1. {"Faida nzuri — endelea kufuatilia gharama" if net_profit > 0 else "⚠️ Hasara — ongeza mauzo au punguza gharama"}
2. Kitengo kikubwa cha gharama kinahitaji ukaguzi
3. Rekodi gharama zote kila siku kwa ufuatiliaji sahihi"""

    return f"""💰 Financial Overview
━━━━━━━━━━━━━━━━━━━━━━━━━

📊 VERIFIED FACTS:
• Revenue Today: {_fmt_rwf(revenue_today)}
• Revenue This Month: {_fmt_rwf(revenue_month)}
• Total Recorded Expenses: {_fmt_rwf(expense_total)}
• Net Profit This Month: {_fmt_rwf(net_profit)}
• Profit Margin: {margin:.1f}%

📂 Expenses by Category:
{cat_lines()}

⚡ Next Steps:
1. {"Healthy margin — keep monitoring cost creep" if net_profit > 0 else "⚠️ Net loss — increase sales volume or cut top expense categories"}
2. Your highest expense category deserves a closer review
3. Record all expenses daily for accurate profit tracking"""


def _build_sales(ctx: dict, lang: str) -> str:
    sales   = ctx.get("sales", {})
    stats   = sales.get("stats", {})
    recent  = sales.get("recent_20", [])
    daily   = sales.get("daily_14_days", [])

    revenue_today = stats.get("revenue_today", stats.get("today_revenue", 0))
    sales_today   = stats.get("sales_today",   stats.get("today_count",   0))
    revenue_week  = stats.get("revenue_week",  stats.get("week_revenue",  0))

    def recent_lines():
        if not recent:
            return "  No recent transactions recorded"
        lines = []
        for s in recent[:8]:
            amt  = _fmt_rwf(s.get("total_amount", s.get("amount", s.get("total", 0))))
            date = str(s.get("date", s.get("created_at", "—")))[:10]
            lines.append(f"  • {date} — {amt}")
        return "\n".join(lines)

    def daily_lines():
        if not daily or not isinstance(daily, list):
            return "  No daily data available"
        return "\n".join(
            f"  • {d.get('day','?')}: {_fmt_rwf(d.get('revenue',0))} ({d.get('sales_count',0)} sales)"
            for d in daily[-7:]
        )

    if lang == "rw":
        return f"""🛒 Isesengura ry'Amagurishwa
━━━━━━━━━━━━━━━━━━━━━━━━━

📊 UKURI:
• Amagurishwa Uyu Munsi: {sales_today}
• Amafaranga Uyu Munsi: {_fmt_rwf(revenue_today)}
• Amafaranga y'Icyumweru: {_fmt_rwf(revenue_week)}

📅 Amagurishwa y'Iminsi 7 Ishize:
{daily_lines()}

🕐 Amagurishwa Ashya:
{recent_lines()}

⚡ Ibikorwa Bikurikira:
1. Reba amasaha menshi amagurishwa akozwe ukore ko ibicuruzwa biriho
2. Iminsi itagurishwa cyane reba impamvu
3. Shishikariza abakiriya babonye ubu gusubira"""

    if lang == "fr":
        return f"""🛒 Analyse des Ventes
━━━━━━━━━━━━━━━━━━━━━━━━━

📊 FAITS VÉRIFIÉS:
• Ventes Aujourd'hui: {sales_today}
• Revenu Aujourd'hui: {_fmt_rwf(revenue_today)}
• Revenu Cette Semaine: {_fmt_rwf(revenue_week)}

📅 Ventes des 7 Derniers Jours:
{daily_lines()}

🕐 Transactions Récentes:
{recent_lines()}

⚡ Prochaines Étapes:
1. Identifiez les heures de pointe et assurez-vous d'avoir du stock
2. Analysez les jours de faibles ventes pour en comprendre la cause
3. Fidélisez les clients réguliers avec des offres spéciales"""

    if lang == "sw":
        return f"""🛒 Uchambuzi wa Mauzo
━━━━━━━━━━━━━━━━━━━━━━━━━

📊 UKWELI:
• Mauzo Leo: {sales_today}
• Mapato Leo: {_fmt_rwf(revenue_today)}
• Mapato Wiki Hii: {_fmt_rwf(revenue_week)}

📅 Mauzo ya Siku 7 Zilizopita:
{daily_lines()}

🕐 Miamala ya Hivi Karibuni:
{recent_lines()}

⚡ Hatua Zinazofuata:
1. Tambua nyakati za kilele za mauzo na hakikisha bidhaa zipo
2. Chunguza sababu za siku zenye mauzo ya chini
3. Wahimize wateja wa kawaida kurudi kwa ofa maalum"""

    return f"""🛒 Sales Analysis
━━━━━━━━━━━━━━━━━━━━━━━━━

📊 VERIFIED FACTS:
• Sales Today: {sales_today} orders
• Revenue Today: {_fmt_rwf(revenue_today)}
• Revenue This Week: {_fmt_rwf(revenue_week)}

📅 Last 7 Days Performance:
{daily_lines()}

🕐 Recent Transactions:
{recent_lines()}

⚡ Next Steps:
1. Identify your peak sales hours and ensure stock is available then
2. Investigate low-sales days — are they patterns or one-offs?
3. Follow up with recent customers to encourage repeat purchases"""


def _build_growth(ctx: dict, lang: str) -> str:
    inventory = ctx.get("inventory", {})
    sales     = ctx.get("sales", {})
    stats     = sales.get("stats", {})
    top       = inventory.get("top_by_value", [])
    low       = inventory.get("low_stock_items", [])
    finances  = ctx.get("finances", {})

    revenue_month = stats.get("revenue_month", stats.get("month_revenue", 0))
    expense_total = finances.get("total_expenses_listed", 0)
    net_profit    = float(revenue_month) - float(expense_total)
    margin        = (net_profit / float(revenue_month) * 100) if float(revenue_month) > 0 else 0

    def top_lines():
        if not top:
            return "  Insufficient data — record more sales to see top performers"
        return "\n".join(
            f"  {i+1}. {p.get('name','?')} — {p.get('qty',0)} units @ {_fmt_rwf(p.get('price',0))}"
            for i, p in enumerate(top[:5])
        )

    restock_note = f"Restock {len(low)} low-stock items to avoid lost sales." if low else "Stock levels are healthy."

    if lang == "rw":
        return f"""📈 Amahirwe yo Gutera Imbere
━━━━━━━━━━━━━━━━━━━━━━━━━

🏆 Ibicuruzwa Bifite Agaciro Gakomeye:
{top_lines()}

💡 INAMA:
• Inyungu nyayo y'ukwezi: {_fmt_rwf(net_profit)} ({margin:.1f}% igenga)
• {"Igenga ry'inyungu ni ryiza — reka uburyo bwifashwe" if margin > 20 else "Ongesha ibiciro cyangwa menge amafaranga yaguriyemo kugira ngo inyungu yiyongere"}
• {restock_note}
• Ibicuruzwa byiganjemo bishobora gutwikiriwa neza

⚡ Ibikorwa Bikurikira:
1. Ongesha ububiko bw'ibicuruzwa bifasha cyane muri iyo nzego
2. Gerageza kwamamaza ibicuruzwa bidagurishwa cyane
3. Gerageza guteranya ibicuruzwa bigurwa buri gihe"""

    if lang == "fr":
        return f"""📈 Opportunités de Croissance
━━━━━━━━━━━━━━━━━━━━━━━━━

🏆 Top Produits par Valeur de Stock:
{top_lines()}

💡 RECOMMANDATIONS:
• Bénéfice net du mois: {_fmt_rwf(net_profit)} (marge {margin:.1f}%)
• {"Bonne marge — maintenez votre stratégie actuelle" if margin > 20 else "Augmentez les prix ou réduisez les coûts pour améliorer la marge"}
• {restock_note}
• Vos meilleurs produits méritent plus de stock et de visibilité

⚡ Prochaines Étapes:
1. Augmentez l'inventaire de vos 3 meilleurs produits
2. Testez des promotions sur les articles qui ne bougent pas
3. Créez des offres groupées avec vos articles populaires"""

    if lang == "sw":
        return f"""📈 Fursa za Ukuaji
━━━━━━━━━━━━━━━━━━━━━━━━━

🏆 Bidhaa Bora kwa Thamani ya Stoo:
{top_lines()}

💡 MAPENDEKEZO:
• Faida halisi ya mwezi: {_fmt_rwf(net_profit)} (asilimia {margin:.1f}%)
• {"Faida nzuri — endelea na mkakati wako" if margin > 20 else "Ongeza bei au punguza gharama ili kuboresha faida"}
• {restock_note}
• Bidhaa bora zaidi zinahitaji akiba zaidi na uonekano

⚡ Hatua Zinazofuata:
1. Ongeza akiba ya bidhaa 3 bora zaidi
2. Jaribu matangazo kwa bidhaa ambazo haziuziki
3. Unda vifurushi vya bidhaa maarufu"""

    return f"""📈 Growth Opportunities & Recommendations
━━━━━━━━━━━━━━━━━━━━━━━━━

🏆 Top Products by Stock Value:
{top_lines()}

💡 RECOMMENDATIONS:
• Monthly net profit: {_fmt_rwf(net_profit)} ({margin:.1f}% margin)
• {"Strong margin — maintain your current pricing strategy" if margin > 20 else "Consider raising prices on top products or cutting your biggest expense"}
• {restock_note}
• Your best-selling products deserve priority stocking and promotion

⚡ Next Steps:
1. Increase inventory for your top 3 performing products
2. Run promotions on slow-moving stock to free up cash
3. Bundle popular items together to increase average order value"""


def _build_purchases(ctx: dict, lang: str) -> str:
    purchases = ctx.get("purchases", {}).get("recent", [])
    partners  = ctx.get("partners", {})
    suppliers = partners.get("total_suppliers", 0)

    def purchase_lines():
        if not purchases:
            return "  No recent purchases recorded"
        lines = []
        for p in purchases[:8]:
            amt  = _fmt_rwf(p.get("total_amount", p.get("amount", p.get("total", 0))))
            date = str(p.get("date", p.get("created_at", "—")))[:10]
            name = p.get("product_name", p.get("item_name", p.get("name", "—")))
            lines.append(f"  • {date} — {name}: {amt}")
        return "\n".join(lines)

    if lang == "rw":
        return f"""🚚 Isesengura ry'Ibigurwa
━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Abaganishi Bose: {suppliers}
🕐 Ibigurwa Bishya:
{purchase_lines()}

⚡ Ibikorwa Bikurikira:
1. Reba ibigurwa byagurijwe vuba ugereranye n'ububiko bwawe
2. Gura ibicuruzwa bikenewe mbere y'uko birangira
3. Fata amasezerano n'abaganishi beza kugira ngo ubike neza"""

    if lang == "fr":
        return f"""🚚 Analyse des Achats
━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Total Fournisseurs: {suppliers}
🕐 Achats Récents:
{purchase_lines()}

⚡ Prochaines Étapes:
1. Comparez vos achats récents avec vos niveaux de stock actuels
2. Passez commande pour les articles en rupture avant qu'ils manquent
3. Négociez de meilleurs tarifs avec vos principaux fournisseurs"""

    if lang == "sw":
        return f"""🚚 Uchambuzi wa Manunuzi
━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Jumla ya Wasambazaji: {suppliers}
🕐 Manunuzi ya Hivi Karibuni:
{purchase_lines()}

⚡ Hatua Zinazofuata:
1. Linganisha manunuzi ya hivi karibuni na viwango vya akiba yako
2. Agiza bidhaa zinazokwisha kabla hazijaisha
3. Jadiliana bei bora na wasambazaji wako wakuu"""

    return f"""🚚 Purchases & Supplier Overview
━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Total Suppliers: {suppliers}
🕐 Recent Purchases:
{purchase_lines()}

⚡ Next Steps:
1. Cross-check recent purchases against current stock levels
2. Reorder items that are running low before they run out
3. Negotiate better pricing with your most-used suppliers"""


def _build_full_report(ctx: dict, lang: str) -> str:
    perf  = _build_performance(ctx, lang)
    inv   = _build_inventory(ctx, lang)
    fin   = _build_financial(ctx, lang)
    sales = _build_sales(ctx, lang)

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    header = {
        "en": f"📋 FULL BUSINESS REPORT — Generated {now}",
        "rw": f"📋 RAPORO YUZUYE Y'UBUCURUZI — Yakozwe {now}",
        "fr": f"📋 RAPPORT COMPLET — Généré le {now}",
        "sw": f"📋 RIPOTI KAMILI — Imetolewa {now}",
    }.get(lang, f"📋 FULL BUSINESS REPORT — Generated {now}")

    separator = "\n\n" + "━" * 30 + "\n\n"
    return header + separator + perf + separator + inv + separator + fin


# ── Unknown intent fallback ───────────────────────────────────────────────────

def _build_unknown(message: str, lang: str) -> str:
    if lang == "rw":
        return f"""🤔 Ikibazo cyawe: "{message}"

Sisobanuye neza icyo ubaza. Gerageza kubaza kimwe muri ibi:

• 📊 Imiterere y'iduka ryanjye ryagenze bite uyu munsi?
• 📦 Ni ibicuruzwa bihe bikenewe kuzuzwa?
• 💰 Isesengura ry'imari yanjye?
• 🛒 Amagurishwa yanjye yo muri iki cyumweru?
• 📈 Amahirwe yo gutera imbere?
• 📋 Raporo yuzuye y'ubucuruzi?"""

    if lang == "fr":
        return f"""🤔 Votre question: "{message}"

Je n'ai pas bien compris. Essayez l'une de ces questions:

• 📊 Comment se porte mon commerce aujourd'hui?
• 📦 Quels produits dois-je réapprovisionner?
• 💰 Analyse de mes finances?
• 🛒 Mes ventes de cette semaine?
• 📈 Opportunités de croissance?
• 📋 Rapport complet de mon commerce?"""

    if lang == "sw":
        return f"""🤔 Swali lako: "{message}"

Sijaelewa vizuri. Jaribu moja ya maswali haya:

• 📊 Biashara yangu inakwenda vipi leo?
• 📦 Bidhaa zipi zinahitaji kujazwa?
• 💰 Uchambuzi wa fedha zangu?
• 🛒 Mauzo yangu ya wiki hii?
• 📈 Fursa za ukuaji?
• 📋 Ripoti kamili ya biashara?"""

    return f"""🤔 I'm not sure I understood: "{message}"

Try asking me one of these:

• 📊 How is my business performing today?
• 📦 Which products need restocking?
• 💰 Give me a financial overview
• 🛒 Show me my sales this week
• 📈 What are my growth opportunities?
• 📋 Generate a full business report"""


# ── Public entry point ────────────────────────────────────────────────────────

def generate_reply(
    user_message: str,
    context: dict,
    language: str,
    history: list,
) -> tuple[str, int, int, float, int]:
    """
    Returns (reply_text, tokens_input, tokens_output, cost_usd, elapsed_ms).
    All zeros for tokens/cost — standalone engine, no external API.
    """
    t0     = time.perf_counter()
    intent = _detect_intent(user_message)

    dispatch = {
        "performance": _build_performance,
        "inventory":   _build_inventory,
        "financial":   _build_financial,
        "sales":       _build_sales,
        "growth":      _build_growth,
        "purchases":   _build_purchases,
        "report":      _build_full_report,
    }

    builder = dispatch.get(intent)
    if builder:
        reply = builder(context, language)
    else:
        reply = _build_unknown(user_message, language)

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    return reply, 0, 0, 0.0, elapsed_ms
