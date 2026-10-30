"""How each company is doing on Higoverse, for the platform admin: how much
it uses the app (sales recorded, products, purchases, expenses), when it was
last busy, and how the platform grows month by month.

Counts and dates only — never a company's money (revenue, profit, prices).
Read-only: plain SELECTs on the business tables in shopdb, each grouped by
shop_id. A table that doesn't exist (a fresh database) counts as empty.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.orm import Session

MONTHS = 12
NEW_DAYS = 30  # a company this young that isn't busy yet is "new", not dormant

# Business records a company makes by using the app.
_ACTIVITY_TABLES = ("sales", "purchases", "expenses", "products", "proformas")


def _month_starts(now: datetime) -> list[datetime]:
    """The first instant of each of the last MONTHS months, oldest first."""
    y, m = now.year, now.month
    out = []
    for _ in range(MONTHS):
        out.append(datetime(y, m, 1, tzinfo=timezone.utc))
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
    return out[::-1]


def _key(d: datetime) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def _aware(d):
    if d is None:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _existing(shop_db: Session) -> set[str]:
    names = ", ".join(f"to_regclass('public.{t}')" for t in _ACTIVITY_TABLES)
    row = shop_db.execute(text(f"SELECT {names}")).first()
    return {t for t, v in zip(_ACTIVITY_TABLES, row) if v is not None}


def _counts(shop_db: Session, table: str, since30: datetime, since7: datetime) -> dict[str, dict]:
    rows = shop_db.execute(text(f"""
        SELECT shop_id,
               count(*)                                         AS total,
               count(*) FILTER (WHERE created_at >= :s30)       AS d30,
               count(*) FILTER (WHERE created_at >= :s7)        AS d7,
               count(*) FILTER (WHERE created_at >= :p30 AND created_at < :s30) AS prev30,
               max(created_at)                                  AS last
        FROM {table} GROUP BY shop_id
    """), {"s30": since30, "s7": since7, "p30": since30 - timedelta(days=30)}).all()
    return {str(r.shop_id): {"total": r.total, "d30": r.d30, "d7": r.d7, "prev30": r.prev30, "last": _aware(r.last)}
            for r in rows}


def _monthly(shop_db: Session, table: str, since: datetime) -> dict[str, dict[str, int]]:
    rows = shop_db.execute(text(f"""
        SELECT shop_id, date_trunc('month', created_at AT TIME ZONE 'UTC') AS m, count(*) AS n
        FROM {table} WHERE created_at >= :since GROUP BY 1, 2
    """), {"since": since}).all()
    out: dict[str, dict[str, int]] = {}
    for r in rows:
        out.setdefault(str(r.shop_id), {})[_key(r.m)] = r.n
    return out


def health(shop, last_record: datetime | None, now: datetime, has_sale: bool = True) -> str:
    """inactive (turned off) · new (joined in the last 30 days, no sale yet:
    still setting up) · active (records this week) · slowing (this month) ·
    dormant."""
    if not shop.is_active:
        return "inactive"
    created = _aware(shop.created_at)
    young = bool(created and created >= now - timedelta(days=NEW_DAYS))
    if young and not has_sale:
        return "new"
    if last_record and last_record >= now - timedelta(days=7):
        return "active"
    if last_record and last_record >= now - timedelta(days=30):
        return "slowing"
    return "new" if young else "dormant"


def build(shops: list, users: list, shop_db: Session, last_active: dict[str, datetime]) -> dict:
    now = datetime.now(timezone.utc)
    since30, since7 = now - timedelta(days=30), now - timedelta(days=7)
    months = _month_starts(now)
    keys = [_key(m) for m in months]

    tables = _existing(shop_db)
    counts = {t: (_counts(shop_db, t, since30, since7) if t in tables else {}) for t in _ACTIVITY_TABLES}
    sales_monthly = _monthly(shop_db, "sales", months[0]) if "sales" in tables else {}

    staff: dict[str, int] = {}
    for u in users:
        if u.shop_id:
            staff[str(u.shop_id)] = staff.get(str(u.shop_id), 0) + 1

    empty = {"total": 0, "d30": 0, "d7": 0, "prev30": 0, "last": None}
    companies = []
    for s in shops:
        sid = str(s.id)
        c = {t: counts[t].get(sid, empty) for t in _ACTIVITY_TABLES}
        # Busy = the company recorded something (a sale, purchase, expense…).
        records = [c[t]["last"] for t in _ACTIVITY_TABLES if c[t]["last"]]
        last_record = max(records) if records else None
        seen = [d for d in (last_record, _aware(s.last_seen_at), last_active.get(sid)) if d]
        monthly = sales_monthly.get(sid, {})
        state = health(s, last_record, now, has_sale=c["sales"]["total"] > 0)
        companies.append({
            "shop_id": sid,
            "health": state,
            "products": c["products"]["total"],
            "sales_total": c["sales"]["total"],
            "sales_30d": c["sales"]["d30"],
            "sales_prev_30d": c["sales"]["prev30"],
            "sales_7d": c["sales"]["d7"],
            "purchases": c["purchases"]["total"],
            "expenses": c["expenses"]["total"],
            "proformas": c["proformas"]["total"],
            "records_30d": sum(c[t]["d30"] for t in _ACTIVITY_TABLES),
            "staff": staff.get(sid, 0),
            "first_sale_month": min(monthly) if monthly else None,
            "last_sale_at": c["sales"]["last"].isoformat() if c["sales"]["last"] else None,
            "last_record_at": last_record.isoformat() if last_record else None,
            "last_activity_at": max(seen).isoformat() if seen else None,
            "monthly_sales": [monthly.get(k, 0) for k in keys],
            # Getting started: what the company has set up so far.
            "setup": {
                "profile": bool(s.phone and s.tin and s.address),
                "logo": bool(s.logo_url),
                "email": bool(s.email_verified),
                "products": c["products"]["total"] > 0,
                "first_sale": c["sales"]["total"] > 0,
                "team": staff.get(sid, 0) > 1,
            },
        })

    # The platform, month by month.
    timeline = []
    for i, k in enumerate(keys):
        start = months[i]
        end = months[i + 1] if i + 1 < len(months) else now + timedelta(seconds=1)
        timeline.append({
            "month": k,
            "new_shops": sum(1 for s in shops if (d := _aware(s.created_at)) and start <= d < end),
            "new_users": sum(1 for u in users if (d := _aware(u.created_at)) and start <= d < end),
            "sales": sum(x["monthly_sales"][i] for x in companies),
            "active_shops": sum(1 for x in companies if x["monthly_sales"][i] > 0),
            "total_shops": sum(1 for s in shops if (d := _aware(s.created_at)) is None or d < end),
        })

    tally: dict[str, int] = {}
    for x in companies:
        tally[x["health"]] = tally.get(x["health"], 0) + 1

    return {
        "generated_at": now.isoformat(),
        "months": keys,
        "health": tally,
        "companies": companies,
        "timeline": timeline,
        "totals": {
            "sales_30d": sum(x["sales_30d"] for x in companies),
            "sales_prev_30d": sum(x["sales_prev_30d"] for x in companies),
            "products": sum(x["products"] for x in companies),
            "with_first_sale": sum(1 for x in companies if x["setup"]["first_sale"]),
        },
    }
