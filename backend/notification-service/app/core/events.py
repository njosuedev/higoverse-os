"""
In-memory pub/sub for SSE real-time notification delivery.
Scale path: swap _subscribers for Redis pub/sub without changing callers.
"""
import asyncio
from collections import defaultdict
from typing import Any

_subscribers: dict[str, list[asyncio.Queue]] = defaultdict(list)
_loop: asyncio.AbstractEventLoop | None = None


def set_event_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


def subscribe(user_id: str) -> asyncio.Queue:
    q: asyncio.Queue = asyncio.Queue(maxsize=200)
    _subscribers[user_id].append(q)
    return q


def unsubscribe(user_id: str, q: asyncio.Queue) -> None:
    try:
        _subscribers[user_id].remove(q)
    except ValueError:
        pass


def publish_sync(user_id: str, event: dict[str, Any]) -> None:
    """Thread-safe publish from synchronous route handlers."""
    if _loop is None:
        return
    for q in list(_subscribers.get(user_id, [])):
        try:
            asyncio.run_coroutine_threadsafe(q.put(event), _loop)
        except Exception:
            pass
