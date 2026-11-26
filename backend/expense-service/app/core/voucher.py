"""The expense book's internal reference: every expense of a business gets a
number of its own, counting on from 001 (001, 002, … 999, 1000, …), like the
vouchers of a cash book.

Given when an expense is first saved, wherever it comes from (the form, an
import, payroll, a correction from Income), and never changed afterwards. A
lock per business keeps two expenses saved at the same moment from getting
the same number; a unique index (main.py) backs it up. Expenses recorded
before numbers existed were numbered once, in date order (main.py).
"""
from datetime import datetime

from sqlalchemy import event, text
from sqlalchemy.orm import Session

from app.models.expense import Expense

PATTERN = r"^[0-9]+$"


def fmt(n: int) -> str:
    return f"{n:03d}"


@event.listens_for(Session, "before_flush")
def number_new_expenses(session: Session, flush_context, instances) -> None:
    new = [o for o in session.new if isinstance(o, Expense) and not o.voucher_no and o.shop_id]
    if not new:
        return
    conn = session.connection()
    last: dict[str, int] = {}
    for e in sorted(new, key=lambda x: (x.expense_date or datetime.max)):
        shop = str(e.shop_id)
        if shop not in last:
            conn.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": f"expense-voucher:{shop}"})
            last[shop] = conn.execute(text(
                "SELECT coalesce(max(voucher_no::bigint), 0) FROM expenses WHERE shop_id = :s AND voucher_no ~ :rx"),
                {"s": shop, "rx": PATTERN}).scalar() or 0
        last[shop] += 1
        e.voucher_no = fmt(last[shop])


# Numbers the expenses recorded before this existed, once, in date order
# (continuing after any number already given). Run at start-up.
BACKFILL_SQL = f"""
WITH mx AS (
    SELECT shop_id, max(voucher_no::bigint) AS m FROM expenses WHERE voucher_no ~ '{PATTERN}' GROUP BY shop_id
), n AS (
    SELECT id, shop_id, row_number() OVER (PARTITION BY shop_id ORDER BY expense_date, created_at, id) AS r
    FROM expenses WHERE voucher_no IS NULL
)
UPDATE expenses x
SET voucher_no = lpad((n.r + coalesce(mx.m, 0))::text, 3, '0')
FROM n LEFT JOIN mx ON mx.shop_id = n.shop_id
WHERE x.id = n.id
"""
