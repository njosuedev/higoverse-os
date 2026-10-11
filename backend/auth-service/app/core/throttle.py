"""Limits on repeated guesses at the sign-in and password-reset endpoints.

Kept in memory: auth-service runs as one uvicorn process on the VPS, so one
dict sees every request. A restart clears the counts, which only ever lets
someone try again sooner, never locks a real user out for longer.
"""
import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request


class Throttle:
    """At most `limit` events per key within `window` seconds."""

    def __init__(self, limit: int, window: int):
        self.limit = limit
        self.window = window
        self._events: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _recent(self, key: str, now: float) -> deque[float]:
        events = self._events[key]
        while events and events[0] <= now - self.window:
            events.popleft()
        if not events:
            self._events.pop(key, None)
            return deque()
        return events

    def blocked(self, key: str) -> bool:
        with self._lock:
            return len(self._recent(key, time.monotonic())) >= self.limit

    def hit(self, key: str) -> int:
        """Record one event; returns how many there are now in the window."""
        with self._lock:
            now = time.monotonic()
            events = self._recent(key, now)
            events.append(now)
            self._events[key] = events
            return len(events)

    def clear(self, key: str) -> None:
        with self._lock:
            self._events.pop(key, None)


# Wrong passwords for one email from one address: 10 per 15 minutes.
login_failures = Throttle(limit=10, window=15 * 60)
# Wrong passwords for one email from anywhere: 30 per 15 minutes. The address
# above comes from headers a client can forge when it reaches the server
# directly (not through Cloudflare), so this cap holds whatever it sends.
login_failures_any_ip = Throttle(limit=30, window=15 * 60)
# Reset codes sent to one email: 3 per 15 minutes (stops inbox flooding).
reset_requests = Throttle(limit=3, window=15 * 60)
# Wrong reset codes for one email: after 5, every code sent to it is cancelled.
reset_failures = Throttle(limit=5, window=15 * 60)


def client_ip(request: Request) -> str:
    """The visitor's address. Behind Cloudflare and nginx the TCP peer is
    always 127.0.0.1, so read the headers they add (Cloudflare's first)."""
    return (
        request.headers.get("cf-connecting-ip")
        or request.headers.get("x-real-ip")
        or (request.client.host if request.client else "unknown")
    )


def too_many(minutes: int = 15) -> HTTPException:
    return HTTPException(
        status_code=429,
        detail=f"Too many attempts. Please wait {minutes} minutes and try again.",
    )
