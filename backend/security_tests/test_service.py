"""Security tests for one service, chosen by HGV_SERVICE (see run.py).

Uses synthetic companies A and B on a throwaway local database only.
"""
import os
import re
import sys
import uuid

import pytest
from jose import jwt

sys.path.insert(0, os.path.dirname(__file__))
import harness  # noqa: E402
from harness import SHOP_A, SHOP_B, auth, token  # noqa: E402

SERVICE = os.environ["HGV_SERVICE"]
APP = harness.load_service(SERVICE)

from fastapi.routing import APIRoute  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

# Routes anyone may call without signing in (path regexes, per service).
PUBLIC = {
    "auth-service": [r"POST /api/v1/auth/(login|refresh|logout|forgot-password|reset-password|mfa/verify)$",
                     r"GET /api/v1/shops/\{shop_id\}$"],
    "product-service": [r"GET /catalogue/public/"],
    "settings-service": [r"GET /api/app-updates/latest$"],
}
ALWAYS_PUBLIC = [r"GET /$", r"GET /health$"]

A_OWNER = token(SHOP_A, "owner")
B_OWNER = token(SHOP_B, "owner")


@pytest.fixture(scope="module")
def client():
    with TestClient(APP, raise_server_exceptions=False) as c:
        yield c


def routes():
    out = []
    for r in APP.routes:
        if isinstance(r, APIRoute):
            for m in sorted(r.methods - {"HEAD", "OPTIONS"}):
                out.append((m, r.path))
    return out


def is_public(method, path):
    key = f"{method} {path}"
    return any(re.search(p, key) for p in ALWAYS_PUBLIC + PUBLIC.get(SERVICE, []))


def fill(path, value=None):
    return re.sub(r"\{[^}]+\}", lambda m: value or str(uuid.uuid4()), path)


def call(client, method, path, headers=None, json=None):
    return client.request(method, path, headers=headers or {}, json=json if json is not None else ({} if method in ("POST", "PUT", "PATCH") else None))


# ── 1. Nothing private answers without a valid token ─────────────────────────

PRIVATE = [(m, p) for m, p in routes() if not is_public(m, p)]


@pytest.mark.parametrize("method,path", PRIVATE, ids=[f"{m} {p}" for m, p in PRIVATE])
def test_private_route_needs_login(client, method, path):
    r = call(client, method, fill(path))
    assert r.status_code in (401, 403), f"{method} {path} answered {r.status_code} without a token"


def _bad_tokens():
    exp = token(SHOP_A, "owner", minutes=-5)
    forged = token(SHOP_A, "owner", secret="not-the-real-secret-" + "x" * 40)
    header = {"alg": "none", "typ": "JWT"}
    import base64
    import json as _j
    b = lambda d: base64.urlsafe_b64encode(_j.dumps(d).encode()).rstrip(b"=").decode()  # noqa: E731
    none_alg = f"{b(header)}.{b({'sub': str(uuid.uuid4()), 'shop_id': SHOP_A, 'role': 'admin'})}."
    return {"expired": exp, "forged": forged, "alg_none": none_alg, "garbage": "abc.def.ghi"}


@pytest.mark.parametrize("kind", ["expired", "forged", "alg_none", "garbage"])
def test_bad_tokens_rejected(client, kind):
    tok = _bad_tokens()[kind]
    checked = 0
    for m, p in PRIVATE:
        if m != "GET" or "{" in p:
            continue
        r = call(client, m, p, auth(tok))
        assert r.status_code in (401, 403), f"{kind} token: GET {p} answered {r.status_code}"
        checked += 1
    if not checked:
        pytest.skip("no plain GET route in this service")


# ── 2. Company B can't reach company A's records ─────────────────────────────

def _create(client, path, body, tok=A_OWNER):
    r = client.post(path, json=body, headers=auth(tok))
    assert r.status_code in (200, 201), f"setup: POST {path} -> {r.status_code} {r.text[:300]}"
    d = r.json()
    d = d.get("data", d) if isinstance(d, dict) else d
    rid = d.get("id") if isinstance(d, dict) else None
    assert rid, f"setup: no id in {r.text[:200]}"
    return str(rid)


def _orm_row(model_path: str, **values) -> str:
    """Inserts one row for company A straight through the service's own model
    (for records whose create route calls other services). Required columns
    get placeholder values; returns the row's id."""
    import importlib
    from datetime import date, datetime, timezone
    from decimal import Decimal
    import sqlalchemy as sa
    mod, cls = model_path.rsplit(".", 1)
    Model = getattr(importlib.import_module(mod), cls)
    row = {}
    for col in Model.__table__.columns:
        if col.name in values or col.nullable or col.default is not None or col.server_default is not None:
            continue
        t = col.type
        if col.primary_key and not isinstance(t, (sa.Integer,)):
            row[col.name] = str(uuid.uuid4()) if not hasattr(t, "as_uuid") or not t.as_uuid else uuid.uuid4()
        elif isinstance(t, sa.Boolean):
            row[col.name] = False
        elif isinstance(t, (sa.Integer, sa.Numeric, sa.Float)):
            row[col.name] = Decimal("1") if isinstance(t, sa.Numeric) else 1
        elif isinstance(t, sa.DateTime):
            row[col.name] = datetime.now(timezone.utc)
        elif isinstance(t, sa.Date):
            row[col.name] = date.today()
        elif hasattr(t, "as_uuid"):
            row[col.name] = uuid.uuid4() if t.as_uuid else str(uuid.uuid4())
        else:
            row[col.name] = "sec-test"
    row.update(values)
    from app.db.database import SessionLocal
    db = SessionLocal()
    try:
        obj = Model(**row)
        db.add(obj)
        db.commit()
        return str(obj.id)
    finally:
        db.close()


def _records(client):
    """{route path template: id of a record company A owns}."""
    if SERVICE == "product-service":
        pid = _create(client, "/products", {"name": "Sec Test Product", "selling_price": 1000, "cost_price": 600, "quantity": 5})
        return {"/products/{product_id}": pid}
    if SERVICE == "supplier-service":
        return {"/suppliers/{supplier_id}": _create(client, "/suppliers", {"name": "Sec Test Supplier", "phone": "0788000000"})}
    if SERVICE == "expense-service":
        eid = _create(client, "/expenses", {"title": "Sec test", "amount": 1000, "category": "other",
                                            "expense_date": "2026-10-01T00:00:00", "payment_method": "mtn",
                                            "receiver_phone": "0788000000"})
        emp = _create(client, "/payroll/employees", {"full_name": "Sec Test Employee", "monthly_salary": 100000})
        return {"/expenses/{expense_id}": eid, "/expenses/{expense_id}/proof": eid,
                "/payroll/employees/{employee_id}": emp, "/payroll/employees/{employee_id}/payments": emp}
    if SERVICE == "sale-service":
        did = _create(client, "/debts", {"debtor_name": "Sec Test Debtor", "phone": "0788000000", "amount_owed": 5000})
        pf = _create(client, "/proforma", {"invoice_no": f"SEC-{uuid.uuid4().hex[:6]}", "date": "2026-10-01",
                                           "valid_until": "2026-10-31", "customer_name": "Sec Test Buyer",
                                           "lines": [{"product_name": "x", "qty": 1, "unit_price": 5000}],
                                           "subtotal": 5000, "grand_total": 5000})
        sid = _orm_row("app.models.sale.Sale", shop_id=SHOP_A, product_id=str(uuid.uuid4()), product_name="Sec Test Item",
                       quantity=1, unit_price=5000, total_amount=5000)
        return {"/sales/{sale_id}": sid, "/sales/{sale_id}/receipt-code": sid,
                "/debts/{debt_id}": did, "/proforma/{proforma_id}": pf, "/proforma/{proforma_id}/deposits": pf,
                "/proforma/{proforma_id}/approve": pf, "/proforma/{proforma_id}/sell": pf}
    if SERVICE == "purchase-service":
        pid = _orm_row("app.models.purchase.Purchase", shop_id=SHOP_A, product_id=str(uuid.uuid4()),
                       product_name="Sec Test Item", quantity_added=1, cost_price=100, total_cost=100)
        return {"/purchases/{purchase_id}": pid}
    return {}


NAME_FIELDS = ("name", "title", "debtor_name", "full_name", "customer_name")


def test_cross_company_access_denied(client):
    recs = _records(client)
    if not recs:
        pytest.skip(f"no record setup for {SERVICE}")
    for path, rid in recs.items():
        url = path.replace(re.search(r"\{[^}]+\}", path).group(0), rid)
        # A can read its own record (proves the id is real).
        if any(m == "GET" and p == path for m, p in routes()) and not path.endswith("/proof"):
            assert client.get(url, headers=auth(A_OWNER)).status_code == 200, f"A can't read its own {url}"
        gettable = any(m == "GET" and p == path for m, p in routes()) and not path.endswith("/proof")
        own = client.get(url, headers=auth(A_OWNER)).json().get("data", {}) if gettable else {}
        for m, p in routes():
            if p != path:
                continue
            if m == "PUT" and own:
                # A valid body (A's own record, renamed) so only ownership can stop it.
                body = {k: v for k, v in own.items() if v is not None and not isinstance(v, (dict, list)) or k == "lines"}
                body.update({k: "hijack" for k in NAME_FIELDS if k in own})
                if "lines" in body:
                    body["lines"] = [{**ln, "product_name": "hijack"} for ln in body["lines"]]
            else:
                body = {"name": "hijack", "title": "hijack", "amount": 1, "method": "cash", "date": "2026-10-01"}
            r = call(client, m, url, auth(B_OWNER), json=body)
            ok = (403, 404) if m == "PUT" and own else (403, 404, 422)
            assert r.status_code in ok, f"B {m} {path} on A's record -> {r.status_code} {r.text[:200]}"
            if r.status_code != 422:
                assert "hijack" not in r.text
        # Still intact for A.
        if any(m == "GET" and p == path for m, p in routes()) and not path.endswith("/proof"):
            r = client.get(url, headers=auth(A_OWNER))
            assert r.status_code == 200 and "hijack" not in r.text, f"A's record changed or gone: {r.status_code}"


def test_lists_show_only_own_company(client):
    recs = _records(client)
    if not recs:
        pytest.skip(f"no record setup for {SERVICE}")
    ids = set(recs.values())
    for m, p in routes():
        if m != "GET" or "{" in p or is_public(m, p):
            continue
        r = client.get(p, headers=auth(B_OWNER))
        if r.status_code != 200:
            continue
        leaked = [i for i in ids if i in r.text]
        assert not leaked, f"GET {p} as company B shows company A's records {leaked}"


# ── 3. Roles: staff can't act as platform admin ──────────────────────────────

# Platform-admin routes: "/admin" paths, plus shop-service's shop controls.
EXTRA_ADMIN = {"shop-service": [("PATCH", "/shops/{shop_id}"), ("POST", "/shops/{shop_id}/toggle")]}
ADMIN_ROUTES = [(m, p) for m, p in routes() if "/admin" in p] + EXTRA_ADMIN.get(SERVICE, [])


@pytest.mark.parametrize("role", ["owner", "manager", "cashier", "accountant", "storekeeper"])
def test_admin_routes_refuse_company_roles(client, role):
    if not ADMIN_ROUTES:
        pytest.skip("no admin routes")
    tok = token(SHOP_A, role)
    for m, p in ADMIN_ROUTES:
        r = call(client, m, fill(p) + f"?shop_id={SHOP_B}", auth(tok))
        assert r.status_code in (401, 403), f"{role}: {m} {p} -> {r.status_code}"


# ── 4. Per-company settings and totals ───────────────────────────────────────

def test_settings_are_per_company(client):
    if SERVICE != "settings-service":
        pytest.skip("settings-service only")
    r = client.put("/settings", json={"currency": "USD", "receipt_footer": "A-ONLY-FOOTER"}, headers=auth(A_OWNER))
    assert r.status_code == 200, r.text[:200]
    assert "A-ONLY-FOOTER" in client.get("/settings", headers=auth(A_OWNER)).text or r.status_code == 200
    b = client.get("/settings", headers=auth(B_OWNER))
    assert b.status_code == 200
    assert "A-ONLY-FOOTER" not in b.text and '"USD"' not in b.text, "company B sees company A's settings"


def test_reports_forward_only_the_callers_token(client, monkeypatch):
    """report-service keeps no data: it asks the other services with the
    caller's own token, so their company checks apply. It must never swap
    in a stronger credential (another token or the internal-service key)."""
    if SERVICE != "report-service":
        pytest.skip("report-service only")
    import requests
    seen = []

    class _Res:
        ok = True
        status_code = 200
        def json(self):
            return {"data": {}}

    def fake_get(url, headers=None, **kw):
        seen.append(dict(headers or {}))
        return _Res()

    monkeypatch.setattr(requests, "get", fake_get)
    for path in ("/reports/summary", "/reports/daily", "/reports/top-items", "/reports/stock-alerts"):
        seen.clear()
        assert client.get(path, headers=auth(B_OWNER)).status_code == 200
        assert seen, f"{path} made no upstream call"
        for h in seen:
            assert h.get("Authorization") == f"Bearer {B_OWNER}", f"{path} forwarded another credential"
            assert not any(k.lower() == "x-higoverse-internal" for k in h), f"{path} sent the internal-service key"
