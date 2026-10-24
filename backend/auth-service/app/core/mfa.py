"""Second sign-in step for the platform admin: authenticator-app codes
(TOTP, RFC 6238: 6 digits, 30 seconds, SHA-1, the format every
authenticator app reads) and one-time recovery codes.

Standard library only. While a code is pending, the user holds a short
"MFA ticket" signed with a key derived from SECRET_KEY, so no other service
(which all verify with SECRET_KEY itself) accepts it as an access token.
"""
import base64
import hashlib
import hmac
import secrets
import struct
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from jose import JWTError, jwt

from app.core.config import settings

ISSUER = "Higoverse"
STEP = 30
DIGITS = 6
TICKET_MINUTES = 5
RECOVERY_CODES = 10


def new_secret() -> str:
    """A random 160-bit secret, base32 (what authenticator apps expect)."""
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _code(secret: str, counter: int) -> str:
    key = base64.b32decode(secret + "=" * (-len(secret) % 8), casefold=True)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    number = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(number % 10 ** DIGITS).zfill(DIGITS)


def check_code(secret: str, code: str, last_counter: int | None = None) -> int | None:
    """The time step the code belongs to (one step of clock drift allowed
    either way), or None. A step at or before [last_counter] is refused, so
    a code can't be used twice."""
    code = "".join(c for c in str(code) if c.isdigit())
    if len(code) != DIGITS:
        return None
    now = int(time.time()) // STEP
    for counter in (now - 1, now, now + 1):
        if last_counter is not None and counter <= last_counter:
            continue
        if hmac.compare_digest(_code(secret, counter), code):
            return counter
    return None


def otpauth_uri(secret: str, account: str) -> str:
    label = quote(f"{ISSUER}:{account}")
    return f"otpauth://totp/{label}?secret={secret}&issuer={quote(ISSUER)}&algorithm=SHA1&digits={DIGITS}&period={STEP}"


# ── Recovery codes ───────────────────────────────────────────────────────────

def _hash_recovery(code: str) -> str:
    return hashlib.sha256(code.replace("-", "").strip().lower().encode()).hexdigest()


def new_recovery_codes() -> tuple[list[str], list[str]]:
    """(codes to show once, their hashes to store)."""
    codes = [f"{secrets.token_hex(4)}-{secrets.token_hex(4)}" for _ in range(RECOVERY_CODES)]
    return codes, [_hash_recovery(c) for c in codes]


def use_recovery_code(hashes: list[str], code: str) -> list[str] | None:
    """The remaining hashes if [code] is one of them (it is used up), else None."""
    h = _hash_recovery(code)
    for stored in hashes:
        if hmac.compare_digest(stored, h):
            return [x for x in hashes if x != stored]
    return None


# ── The ticket between password and code ─────────────────────────────────────

def _ticket_key() -> str:
    return hmac.new(settings.SECRET_KEY.encode(), b"higoverse-mfa-ticket-v1", hashlib.sha256).hexdigest()


def make_ticket(user_id: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=TICKET_MINUTES)
    return jwt.encode({"sub": user_id, "typ": "mfa", "exp": exp}, _ticket_key(), algorithm="HS256")


def read_ticket(ticket: str) -> str | None:
    """The user id in a valid, unexpired ticket, or None."""
    try:
        p = jwt.decode(ticket, _ticket_key(), algorithms=["HS256"])
    except JWTError:
        return None
    return p.get("sub") if p.get("typ") == "mfa" else None
