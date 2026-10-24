"""Runs one service in-process against a throwaway local PostgreSQL.

Safety: every setting named in the service's .env is replaced with a dummy
value before the service is imported, so nothing (database, email, storage)
can fall back to a real value. The run stops unless the database is the
local test one (HGV_TEST_PG, default 127.0.0.1:55432).
"""
import os
import re
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
PG = os.environ.get("HGV_TEST_PG", "postgresql://hgvtest@127.0.0.1:55432")
TEST_SECRET = "test-only-secret-not-used-anywhere-else-0123456789abcdef"
DEAD_URL = "http://127.0.0.1:9"  # nothing listens on the discard port

if not re.match(r"postgresql://[^@]+@(127\.0\.0\.1|localhost):\d+$", PG):
    sys.exit(f"Refusing to run: HGV_TEST_PG must be a local database, got {PG!r}")


def _env_names(service_dir: Path) -> set[str]:
    """Only the variable names in the service's .env (never the values)."""
    names = set()
    f = service_dir / ".env"
    if f.exists():
        for line in f.read_text(encoding="utf-8", errors="ignore").splitlines():
            m = re.match(r"\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=", line)
            if m:
                names.add(m.group(1))
    return names


def load_service(name: str):
    """Imports backend/<name>/app/main.py with safe settings; returns the app."""
    service_dir = BACKEND / name
    for k in _env_names(service_dir):
        os.environ[k] = "0"  # parses as a number, a flag or a string
    own_db = "authdb" if name == "auth-service" else "shopdb"
    os.environ.update({
        "DATABASE_URL": f"{PG}/{own_db}",
        "SHOP_DB_URL": f"{PG}/shopdb",
        "AUTH_DB_URL": f"{PG}/authdb",
        "SECRET_KEY": TEST_SECRET,
        "AUTH_SERVICE_SECRET": TEST_SECRET,
        "ALGORITHM": "HS256",
        "AUTH_SERVICE_ALGORITHM": "HS256",
        "ACCESS_TOKEN_EXPIRE_MINUTES": "60",
        "REFRESH_TOKEN_EXPIRE_DAYS": "30",
    })
    for k in list(os.environ):
        if k.endswith("_SERVICE_URL"):
            os.environ[k] = DEAD_URL
    for k in ("SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD", "SMTP_PASS", "RESEND_API_KEY", "SENDGRID_API_KEY"):
        os.environ[k] = ""
    # The service's own .env must not be read: run from an empty directory.
    os.chdir(Path(__file__).resolve().parent)
    sys.path.insert(0, str(service_dir))
    from app.main import app  # noqa: E402
    _assert_local(name)
    return app


def _assert_local(name: str):
    """Every database engine the service built must point at the test server."""
    import gc
    from sqlalchemy.engine import Engine
    host = PG.split("@", 1)[1]
    for obj in gc.get_objects():
        if isinstance(obj, Engine):
            url = obj.url.render_as_string(hide_password=True)
            if host not in url:
                sys.exit(f"Refusing to run {name}: an engine points at {url}")


def token(shop_id: str, role: str = "owner", layout: str = "retail", user_id: str | None = None,
          minutes: int = 60, secret: str = TEST_SECRET, **extra) -> str:
    from jose import jwt
    uid = user_id or str(uuid.uuid4())
    payload = {
        "sub": uid, "staff_id": uid, "shop_id": shop_id, "email": f"{uid[:8]}@test.invalid",
        "role": role, "name": f"Test {role}", "layout": layout,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=minutes), **extra,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def auth(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


SHOP_A = "aaaaaaaa-0000-4000-8000-00000000000a"
SHOP_B = "bbbbbbbb-0000-4000-8000-00000000000b"
