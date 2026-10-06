"""Live updates over WebSocket: GET /ws (wss://higoverse.com/svc/sales/ws).

The services that change shop data announce each change with pg_notify (see
app/core/events.py). This hub LISTENs on that channel in a background thread
and forwards every event to the open connections of the same shop, so the
apps update without polling. It also tells each shop who is online.

Protocol (JSON text frames):
  client → {"type": "auth", "token": "<access token>"}   first, within 10 s;
           sent again whenever the app renews its token
  client → {"type": "ping"}                              every ~25 s
  server → {"type": "hello", "online": [...]}            after a good auth
  server → {"type": "pong"}
  server → {"type": "presence", "online": [{"id", "name", "role"}]}
  server → {"type": "resync"}       events may have been missed: reload
  server → {"type": "sale.created", "at", "by", "data", ...}   (and the others)
  server → {"type": "chat.message" | "chat.read", ...}  only to the two people
Close codes: 4001 token missing, invalid or expired (renew and reconnect),
4003 account without a shop, 4008 no message for too long.
"""
import asyncio
import json
import select
import threading
import time
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt

from app.core.config import settings
from app.core.events import CHANNEL
from app.core.security import hides_financials
from app.db.database import engine

router = APIRouter(tags=["Live"])

# Blanked for viewers who may not see money figures (see hides_financials);
# events marked "financial" are not sent to them at all.
_FINANCIAL_KEYS = {"profit", "cost_at_sale", "revenue", "cost_price", "profit_money", "profit_percent"}

_AUTH_TIMEOUT = 10      # seconds to send the first auth message
_IDLE_TIMEOUT = 75      # the app pings every ~25 s; three missed pings = gone
_MAX_FRAME = 8192       # client frames are tiny; anything bigger is refused
_QUEUE_SIZE = 200       # events waiting for a slow phone before it is dropped


def _decode(token: str) -> dict | None:
    try:
        p = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.AUTH_SERVICE_ALGORITHM])
    except (JWTError, AttributeError, TypeError):
        return None
    return {
        "user_id": p.get("sub"),
        "shop_id": str(p["shop_id"]) if p.get("shop_id") else None,
        "name": p.get("name") or p.get("email") or "",
        "role": p.get("role"),
        "layout": p.get("layout"),
        "exp": float(p.get("exp") or 0),
    }


class _Client:
    def __init__(self, ws: WebSocket, user: dict):
        self.ws = ws
        self.user = user
        self.queue: asyncio.Queue[str] = asyncio.Queue(maxsize=_QUEUE_SIZE)

    def offer(self, text: str) -> bool:
        try:
            self.queue.put_nowait(text)
            return True
        except asyncio.QueueFull:
            return False


class Hub:
    def __init__(self):
        self.shops: dict[str, set[_Client]] = {}
        self.loop: asyncio.AbstractEventLoop | None = None

    # ── connections ─────────────────────────────────────
    def add(self, c: _Client):
        self.shops.setdefault(c.user["shop_id"], set()).add(c)
        self._presence(c.user["shop_id"])

    def remove(self, c: _Client):
        shop = c.user["shop_id"]
        clients = self.shops.get(shop)
        if clients is None:
            return
        clients.discard(c)
        if not clients:
            del self.shops[shop]
        self._presence(shop)

    def online(self, shop_id: str) -> list[dict]:
        seen: dict[str, dict] = {}
        for c in self.shops.get(shop_id, ()):
            u = c.user
            seen.setdefault(u["user_id"], {"id": u["user_id"], "name": u["name"], "role": u["role"]})
        return sorted(seen.values(), key=lambda u: (u["name"] or "").lower())

    def _presence(self, shop_id: str):
        self._send_shop(shop_id, json.dumps({"type": "presence", "online": self.online(shop_id)}))

    def _send_shop(self, shop_id: str, text: str):
        for c in list(self.shops.get(shop_id, ())):
            if not c.offer(text):
                # Too far behind: drop it; the app reconnects and reloads.
                asyncio.ensure_future(c.ws.close(code=4008))

    # ── events (called on the event loop) ───────────────
    def dispatch(self, payload: str):
        try:
            event = json.loads(payload)
        except ValueError:
            return
        shop = event.get("shop_id")
        clients = self.shops.get(shop)
        if not clients:
            return
        financial = bool(event.pop("financial", False))
        # Messages: only the people of that conversation, on all their devices.
        to = set(event.pop("to", None) or ())
        full = json.dumps(event)
        scrubbed = None
        for c in list(clients):
            if to and str(c.user["user_id"]) not in to:
                continue
            if hides_financials(c.user):
                if financial:
                    continue
                if scrubbed is None:
                    data = event.get("data")
                    if isinstance(data, dict):
                        data = {k: (None if k in _FINANCIAL_KEYS else v) for k, v in data.items()}
                    scrubbed = json.dumps({**event, "data": data})
                text = scrubbed
            else:
                text = full
            if not c.offer(text):
                asyncio.ensure_future(c.ws.close(code=4008))

    def resync_all(self):
        text = json.dumps({"type": "resync"})
        for shop in list(self.shops):
            self._send_shop(shop, text)

    # ── Postgres listener (own thread) ──────────────────
    def start(self, loop: asyncio.AbstractEventLoop):
        if self.loop is not None:
            return
        self.loop = loop
        if engine is None:
            return
        threading.Thread(target=self._listen, name="hgv-live-listener", daemon=True).start()

    def _listen(self):
        import psycopg2.extensions

        first = True
        while True:
            raw = None
            try:
                raw = engine.raw_connection()
                conn = getattr(raw, "driver_connection", None) or raw.connection
                conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
                cur = conn.cursor()
                cur.execute(f"LISTEN {CHANNEL}")
                if not first:
                    # Events sent while we were reconnecting are lost.
                    self.loop.call_soon_threadsafe(self.resync_all)
                first = False
                while True:
                    if select.select([conn], [], [], 30) == ([], [], []):
                        cur.execute("SELECT 1")  # notices a dead connection
                        continue
                    conn.poll()
                    while conn.notifies:
                        n = conn.notifies.pop(0)
                        self.loop.call_soon_threadsafe(self.dispatch, n.payload)
            except Exception as exc:  # DB restart, network blip…
                print(f"[live] listener error, retrying: {exc!r}", flush=True)
                time.sleep(3)
            finally:
                try:
                    if raw is not None:
                        raw.close()
                except Exception:
                    pass


hub = Hub()


async def _sender(c: _Client):
    while True:
        text = await c.queue.get()
        await c.ws.send_text(text)


@router.websocket("/ws")
async def live(ws: WebSocket):
    await ws.accept()
    hub.start(asyncio.get_running_loop())

    async def receive() -> dict | None:
        text = await ws.receive_text()
        if len(text) > _MAX_FRAME:
            return None
        try:
            msg = json.loads(text)
        except ValueError:
            return None
        return msg if isinstance(msg, dict) else None

    try:
        first = await asyncio.wait_for(receive(), _AUTH_TIMEOUT)
    except (asyncio.TimeoutError, WebSocketDisconnect):
        await _close(ws, 4001)
        return
    user = _decode(first.get("token", "")) if first and first.get("type") == "auth" else None
    if not user or user["exp"] <= time.time():
        await _close(ws, 4001)
        return
    if not user["shop_id"]:
        await _close(ws, 4003)
        return

    client = _Client(ws, user)
    hub.add(client)
    sender = None
    try:
        await ws.send_text(json.dumps({
            "type": "hello",
            "server_time": datetime.now(timezone.utc).isoformat(),
            "online": hub.online(user["shop_id"]),
        }))
        sender = asyncio.create_task(_sender(client))
        last_seen = time.time()
        while True:
            now = time.time()
            if client.user["exp"] <= now:
                await _close(ws, 4001)
                return
            if now - last_seen > _IDLE_TIMEOUT:
                await _close(ws, 4008)
                return
            wait = min(_IDLE_TIMEOUT - (now - last_seen), client.user["exp"] - now) + 0.1
            try:
                msg = await asyncio.wait_for(receive(), wait)
            except asyncio.TimeoutError:
                continue  # the checks above decide
            last_seen = time.time()
            if msg is None:
                continue
            kind = msg.get("type")
            if kind == "ping":
                client.offer(json.dumps({"type": "pong"}))
            elif kind == "auth":
                renewed = _decode(msg.get("token", ""))
                # Same person, same shop: just extend the connection.
                if renewed and renewed["user_id"] == user["user_id"] and renewed["shop_id"] == user["shop_id"]:
                    client.user = renewed
    except WebSocketDisconnect:
        pass
    finally:
        if sender is not None:
            sender.cancel()
        hub.remove(client)


async def _close(ws: WebSocket, code: int):
    try:
        await ws.close(code=code)
    except Exception:
        pass  # already gone
