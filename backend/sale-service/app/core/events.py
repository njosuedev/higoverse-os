"""Live events: tell the shop's open apps that something just changed.

`emit()` runs pg_notify inside the request's own transaction, so Postgres
delivers the event only when that transaction commits — a change that is
rolled back is never announced. sale-service's hub (app/realtime.py) LISTENs
on the channel and forwards each event over WebSocket to the shop's users.

The same file lives in every service that changes shop data; keep the copies
identical (backend/*/app/core/events.py).
"""
import json
from datetime import datetime, timezone

from sqlalchemy import text

CHANNEL = "hgv_events"

# Postgres refuses NOTIFY payloads of 8000 bytes or more.
_MAX_BYTES = 7900


def emit(db, user: dict, kind: str, data: dict, financial: bool = False) -> None:
    """Queue `kind` (e.g. "sale.created") for the user's shop.

    `financial` marks events only people who may see money figures receive
    (see hides_financials); the hub also blanks financial fields per viewer.
    Best effort: a live update must never make the change itself fail.
    """
    shop_id = user.get("shop_id")
    if not shop_id:
        return
    body = {
        "type": kind,
        "shop_id": str(shop_id),
        "at": datetime.now(timezone.utc).isoformat(),
        "by": {"id": user.get("user_id"), "name": user.get("name") or user.get("email")},
        "financial": financial,
        "data": data,
    }
    payload = json.dumps(body, default=str)
    if len(payload.encode()) >= _MAX_BYTES:
        # Too big to send whole: say what changed and let apps reload it.
        body["data"] = {k: data.get(k) for k in ("id", "name") if k in data}
        payload = json.dumps(body, default=str)
    try:
        # Savepoint: if NOTIFY fails, only it is undone — not the change.
        with db.begin_nested():
            db.execute(text("SELECT pg_notify(:c, :p)"), {"c": CHANNEL, "p": payload})
    except Exception:
        pass
