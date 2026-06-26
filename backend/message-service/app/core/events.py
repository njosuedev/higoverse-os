"""
In-memory pub/sub for SSE real-time delivery.

Each user/shop SSE connection subscribes to one or more channels.
When a message is sent, publish_sync() (callable from sync route handlers)
dispatches the event to all active SSE connections on the channel.

Scale path: replace the dict + asyncio.Queue with Redis pub/sub
(redis-py aioredis) without changing callers. One Redis channel per user/shop_id.
"""
import asyncio
from collections import defaultdict
from typing import Any

# channel_id → list of asyncio.Queues (one per active SSE connection)
_subscribers: dict[str, list[asyncio.Queue]] = defaultdict(list)

# Captured once on startup so sync handlers can schedule coroutines
_loop: asyncio.AbstractEventLoop | None = None


def set_event_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


def subscribe(channels: list[str]) -> asyncio.Queue:
    """Register a new SSE connection and return its event queue."""
    q: asyncio.Queue = asyncio.Queue(maxsize=200)
    for ch in channels:
        _subscribers[ch].append(q)
    return q


def unsubscribe(channels: list[str], q: asyncio.Queue) -> None:
    for ch in channels:
        try:
            _subscribers[ch].remove(q)
        except ValueError:
            pass


def publish_sync(channel: str, event: dict[str, Any]) -> None:
    """Thread-safe publish from synchronous FastAPI route handlers."""
    if _loop is None:
        return
    for q in list(_subscribers.get(channel, [])):
        try:
            asyncio.run_coroutine_threadsafe(q.put(event), _loop)
        except Exception:
            pass
