"""auth-service: sign-in, sessions, password reset, team roles and the public
company profile. Synthetic users on the throwaway local database only."""
import os
import sys
import uuid

import pytest

sys.path.insert(0, os.path.dirname(__file__))
import harness  # noqa: E402
from harness import auth  # noqa: E402

assert os.environ["HGV_SERVICE"] == "auth-service"
APP = harness.load_service("auth-service")

from fastapi.testclient import TestClient  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.db.shop_session import ShopSessionLocal  # noqa: E402
from app.models.shop import Shop  # noqa: E402
from app.models.user import User  # noqa: E402

PASSWORD = "Correct-Horse-9"


@pytest.fixture(scope="module")
def client():
    with TestClient(APP, raise_server_exceptions=False) as c:
        yield c


def _company(owner_role="owner"):
    """A new active company with an owner; returns (shop_id, owner_email)."""
    sid = uuid.uuid4()
    tag = sid.hex[:8]
    with ShopSessionLocal() as s:
        s.add(Shop(id=sid, name=f"Sec Co {tag}", email=f"co-{tag}@sectest.example.com", phone="0788000000",
                   tin="123456789", address="Kigali", description='{"_owner": "Private Owner", "_email": "owner@sectest.example.com"}',
                   is_active=True))
        s.commit()
    email = f"owner-{tag}@sectest.example.com"
    with SessionLocal() as s:
        s.add(User(id=uuid.uuid4(), name="Owner", email=email, password_hash=hash_password(PASSWORD),
                   shop_id=sid, role=owner_role, is_active=True))
        s.commit()
    return str(sid), email


def _login(client, email, password=PASSWORD):
    return client.post("/api/v1/auth/login", json={"email": email, "password": password})


def _tokens(client, email):
    r = _login(client, email)
    assert r.status_code == 200, r.text[:200]
    return r.json()["access_token"], r.json()["refresh_token"]


# ── Sign-in ──────────────────────────────────────────────────────────────────

def test_login_does_not_reveal_which_emails_exist(client):
    _, email = _company()
    wrong = _login(client, email, "wrong-password")
    unknown = _login(client, f"nobody-{uuid.uuid4().hex[:6]}@sectest.example.com", "wrong-password")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_login_brute_force_is_throttled(client):
    _, email = _company()
    codes = [_login(client, email, f"guess-{i}").status_code for i in range(12)]
    assert 429 in codes, f"no throttling after 12 wrong passwords: {codes}"
    # Even the right password waits once the email is locked.
    assert _login(client, email).status_code == 429


def test_forged_client_ip_does_not_reset_the_limit(client):
    """The per-email cap holds whatever address the client claims."""
    _, email = _company()
    codes = [client.post("/api/v1/auth/login", json={"email": email, "password": f"g{i}"},
                         headers={"CF-Connecting-IP": f"10.0.{i}.1"}).status_code for i in range(35)]
    assert 429 in codes, "rotating CF-Connecting-IP avoided every limit"


# ── Sessions ─────────────────────────────────────────────────────────────────

def test_refresh_token_is_single_use_after_logout(client):
    _, email = _company()
    _, refresh = _tokens(client, email)
    assert client.post("/api/v1/auth/logout", json={"refresh_token": refresh}).status_code == 200
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": refresh}).status_code == 401


def test_deactivated_user_cannot_refresh(client):
    _, email = _company()
    _, refresh = _tokens(client, email)
    with SessionLocal() as s:
        s.query(User).filter(User.email == email).update({"is_active": False})
        s.commit()
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": refresh}).status_code == 401


def test_password_change_signs_out_other_devices(client):
    _, email = _company()
    _, stolen = _tokens(client, email)          # another device (or an attacker)
    access, _ = _tokens(client, email)          # this device
    r = client.put("/api/v1/auth/change-password", headers=auth(access),
                   json={"current_password": PASSWORD, "new_password": "New-Password-123"})
    assert r.status_code == 200, r.text[:200]
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": stolen}).status_code == 401, \
        "a session from before the password change still works"


def test_password_reset_signs_out_every_device(client, monkeypatch):
    _, email = _company()
    _, stolen = _tokens(client, email)
    sent = {}
    import app.api.v1.auth as auth_routes
    monkeypatch.setattr(auth_routes, "send_otp_email", lambda to, otp: sent.update(otp=otp))
    assert client.post("/api/v1/auth/forgot-password", json={"email": email}).status_code == 200
    r = client.post("/api/v1/auth/reset-password", json={"email": email, "otp": sent["otp"], "new_password": "Reset-Password-123"})
    assert r.status_code == 200, r.text[:200]
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": stolen}).status_code == 401, \
        "a session from before the password reset still works"


def test_reset_code_guessing_is_limited(client, monkeypatch):
    _, email = _company()
    sent = {}
    import app.api.v1.auth as auth_routes
    monkeypatch.setattr(auth_routes, "send_otp_email", lambda to, otp: sent.update(otp=otp))
    client.post("/api/v1/auth/forgot-password", json={"email": email})
    wrong = f"{(int(sent['otp']) + 1) % 10**6:06d}"
    codes = [client.post("/api/v1/auth/reset-password", json={"email": email, "otp": wrong, "new_password": "x" * 10}).status_code
             for _ in range(6)]
    assert 429 in codes
    # The real code no longer works either.
    r = client.post("/api/v1/auth/reset-password", json={"email": email, "otp": sent["otp"], "new_password": "x" * 10})
    assert r.status_code in (400, 429)


def test_forgot_password_does_not_reveal_which_emails_exist(client, monkeypatch):
    _, email = _company()
    import app.api.v1.auth as auth_routes
    monkeypatch.setattr(auth_routes, "send_otp_email", lambda to, otp: None)
    known = client.post("/api/v1/auth/forgot-password", json={"email": email})
    unknown = client.post("/api/v1/auth/forgot-password", json={"email": f"nobody-{uuid.uuid4().hex[:6]}@sectest.example.com"})
    assert known.status_code == unknown.status_code == 200 and known.json() == unknown.json()


# ── Team roles ───────────────────────────────────────────────────────────────

def _employee(client, access, role="cashier"):
    r = client.post("/api/v1/team", headers=auth(access), json={
        "name": "Staff", "email": f"staff-{uuid.uuid4().hex[:8]}@sectest.example.com", "password": "Staff-Pass-123", "role": role})
    return r


@pytest.mark.parametrize("role", ["admin", "owner", "superuser"])
def test_owner_cannot_create_privileged_roles(client, role):
    _, email = _company()
    access, _ = _tokens(client, email)
    assert _employee(client, access, role).status_code == 422


def test_owner_cannot_promote_staff_to_admin(client):
    _, email = _company()
    access, _ = _tokens(client, email)
    emp = _employee(client, access).json()["data"]["id"]
    r = client.patch(f"/api/v1/team/{emp}", headers=auth(access), json={"role": "admin"})
    assert r.status_code == 422


def test_other_company_cannot_touch_my_staff(client):
    _, a_email = _company()
    _, b_email = _company()
    a_access, _ = _tokens(client, a_email)
    b_access, _ = _tokens(client, b_email)
    emp = _employee(client, a_access).json()["data"]["id"]
    assert client.patch(f"/api/v1/team/{emp}", headers=auth(b_access), json={"is_active": False}).status_code == 404
    assert client.delete(f"/api/v1/team/{emp}", headers=auth(b_access)).status_code == 404
    team_b = client.get("/api/v1/team", headers=auth(b_access)).text
    assert emp not in team_b


def test_cashier_cannot_manage_team(client):
    _, email = _company()
    access, _ = _tokens(client, email)
    staff_email = f"cashier-{uuid.uuid4().hex[:8]}@sectest.example.com"
    client.post("/api/v1/team", headers=auth(access), json={"name": "C", "email": staff_email, "password": "Staff-Pass-123", "role": "cashier"})
    c_access = _login(client, staff_email, "Staff-Pass-123").json()["access_token"]
    assert _employee(client, c_access).status_code == 403


def test_profile_update_cannot_change_role_or_company(client):
    sid, email = _company()
    access, _ = _tokens(client, email)
    other = str(uuid.uuid4())
    client.put("/api/v1/auth/profile", headers=auth(access), json={"name": "Renamed", "role": "admin", "shop_id": other})
    with SessionLocal() as s:
        u = s.query(User).filter(User.email == email).first()
        assert u.role == "owner" and str(u.shop_id) == sid


# ── Public company profile ───────────────────────────────────────────────────

PRIVATE_FIELDS = ("email", "tin", "description")


def test_public_profile_hides_private_details(client):
    sid, _ = _company()
    r = client.get(f"/api/v1/shops/{sid}")
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["name"]
    leaked = [k for k in PRIVATE_FIELDS if data.get(k)]
    assert not leaked, f"anyone can read {leaked} of any company"


def test_other_company_sees_only_public_profile(client):
    sid, _ = _company()
    _, b_email = _company()
    b_access, _ = _tokens(client, b_email)
    data = client.get(f"/api/v1/shops/{sid}", headers=auth(b_access)).json()["data"]
    assert not [k for k in PRIVATE_FIELDS if data.get(k)]


def test_own_company_sees_full_profile(client):
    sid, email = _company()
    access, _ = _tokens(client, email)
    data = client.get(f"/api/v1/shops/{sid}", headers=auth(access)).json()["data"]
    assert data.get("email") and data.get("tin")


def test_company_directory_needs_login(client):
    assert client.get("/api/v1/shops").status_code in (401, 403)


def test_reset_requests_capped_per_day(client, monkeypatch):
    _, email = _company()
    import app.api.v1.auth as auth_routes
    import app.core.throttle as th
    monkeypatch.setattr(auth_routes, "send_otp_email", lambda to, otp: None)
    codes = []
    for _ in range(11):
        th.reset_requests.clear(email)  # step past the 15-minute limit
        codes.append(client.post("/api/v1/auth/forgot-password", json={"email": email}).status_code)
    assert codes[:10] == [200] * 10 and codes[10] == 429, codes


def test_full_profile_is_never_publicly_cached(client):
    sid, email = _company()
    access, _ = _tokens(client, email)
    own = client.get(f"/api/v1/shops/{sid}", headers=auth(access))
    assert "no-store" in own.headers.get("cache-control", "") and "private" in own.headers.get("cache-control", "")
    anon = client.get(f"/api/v1/shops/{sid}")
    assert "Authorization" in anon.headers.get("vary", "")


# ── Platform admin two-step sign-in ──────────────────────────────────────────

def _admin():
    email = f"admin-{uuid.uuid4().hex[:8]}@sectest.example.com"
    with SessionLocal() as s:
        s.add(User(id=uuid.uuid4(), name="Admin", email=email, password_hash=hash_password(PASSWORD),
                   shop_id=None, role="admin", is_active=True))
        s.commit()
    return email


def _now_code(secret, step=0):
    import time
    from app.core import mfa
    return mfa._code(secret, int(time.time()) // mfa.STEP + step)


def _enable(client, email):
    access, refresh = _tokens(client, email)
    secret = client.post("/api/v1/auth/mfa/setup", headers=auth(access)).json()["data"]["secret"]
    r = client.post("/api/v1/auth/mfa/enable", headers=auth(access), json={"code": _now_code(secret)})
    assert r.status_code == 200, r.text[:200]
    return secret, r.json(), refresh


def test_admin_without_two_step_signs_in_as_before(client):
    email = _admin()
    r = _login(client, email)
    assert r.status_code == 200 and r.json().get("access_token")


def test_two_step_is_admin_only(client):
    _, email = _company()
    access, _ = _tokens(client, email)
    assert client.post("/api/v1/auth/mfa/setup", headers=auth(access)).status_code == 403


def test_setup_alone_does_not_change_sign_in(client):
    email = _admin()
    access, _ = _tokens(client, email)
    client.post("/api/v1/auth/mfa/setup", headers=auth(access))
    assert _login(client, email).json().get("access_token"), "a half-finished setup must never lock the admin out"


def test_enable_needs_a_working_code(client):
    email = _admin()
    access, _ = _tokens(client, email)
    client.post("/api/v1/auth/mfa/setup", headers=auth(access))
    assert client.post("/api/v1/auth/mfa/enable", headers=auth(access), json={"code": "000000"}).status_code in (400, 429)
    assert _login(client, email).json().get("access_token")


def test_after_enabling_password_alone_gives_no_session(client):
    email = _admin()
    secret, enabled, old_refresh = _enable(client, email)
    assert len(enabled["data"]["recovery_codes"]) == 10 and enabled.get("access_token")
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh}).status_code == 401, \
        "sessions from before two-step was turned on must end"
    r = _login(client, email)
    assert r.status_code == 200
    body = r.json()
    assert body.get("mfa_required") and body.get("mfa_ticket") and not body.get("access_token") and not body.get("refresh_token")


def test_ticket_is_not_an_access_token(client):
    email = _admin()
    _enable(client, email)
    ticket = _login(client, email).json()["mfa_ticket"]
    assert client.get("/api/v1/me", headers=auth(ticket)).status_code == 401
    assert client.get("/api/v1/admin/stats", headers=auth(ticket)).status_code in (401, 403)


def test_code_completes_sign_in_once(client):
    email = _admin()
    secret, _, _ = _enable(client, email)
    import time
    from app.core import mfa
    time.sleep(max(0, mfa.STEP - time.time() % mfa.STEP) + 0.5)   # a fresh time step
    code = _now_code(secret)
    ticket = _login(client, email).json()["mfa_ticket"]
    r = client.post("/api/v1/auth/mfa/verify", json={"mfa_ticket": ticket, "code": code})
    assert r.status_code == 200 and r.json().get("access_token") and r.json().get("refresh_token")
    ticket = _login(client, email).json()["mfa_ticket"]
    again = client.post("/api/v1/auth/mfa/verify", json={"mfa_ticket": ticket, "code": code})
    assert again.status_code == 400, "the same code worked twice"


def test_code_guessing_is_limited(client):
    email = _admin()
    secret, _, _ = _enable(client, email)
    ticket = _login(client, email).json()["mfa_ticket"]
    wrong = f"{(int(_now_code(secret)) + 500000) % 10**6:06d}"
    codes = [client.post("/api/v1/auth/mfa/verify", json={"mfa_ticket": ticket, "code": wrong}).status_code for _ in range(6)]
    assert codes[:5] == [400] * 5 and codes[5] == 429, codes


def test_recovery_code_works_once(client):
    email = _admin()
    _, enabled, _ = _enable(client, email)
    rc = enabled["data"]["recovery_codes"][0]
    ticket = _login(client, email).json()["mfa_ticket"]
    assert client.post("/api/v1/auth/mfa/verify", json={"mfa_ticket": ticket, "code": rc}).status_code == 200
    ticket = _login(client, email).json()["mfa_ticket"]
    assert client.post("/api/v1/auth/mfa/verify", json={"mfa_ticket": ticket, "code": rc}).status_code == 400


def test_forged_or_expired_ticket_refused(client):
    email = _admin()
    secret, _, _ = _enable(client, email)
    from jose import jwt
    from datetime import datetime, timedelta, timezone
    with SessionLocal() as s:
        uid = str(s.query(User).filter(User.email == email).first().id)
    forged = jwt.encode({"sub": uid, "typ": "mfa", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
                        harness.TEST_SECRET, algorithm="HS256")   # signed with the plain key: not a ticket
    assert client.post("/api/v1/auth/mfa/verify", json={"mfa_ticket": forged, "code": _now_code(secret)}).status_code == 401


def test_disable_needs_password_and_code(client):
    email = _admin()
    secret, enabled, _ = _enable(client, email)
    access = enabled["access_token"]
    rc = enabled["data"]["recovery_codes"]
    assert client.post("/api/v1/auth/mfa/disable", headers=auth(access), json={"password": "wrong", "code": rc[0]}).status_code == 400
    assert client.post("/api/v1/auth/mfa/disable", headers=auth(access), json={"password": PASSWORD, "code": rc[1]}).status_code == 200
    assert _login(client, email).json().get("access_token")


# ── Setting a password for someone (no email needed) ─────────────────────────

def _staff(client, owner_access, role="cashier"):
    email = f"staff-{uuid.uuid4().hex[:8]}@sectest.example.com"
    r = client.post("/api/v1/team", headers=auth(owner_access),
                    json={"name": "Staff", "email": email, "password": "Staff-Pass-123", "role": role})
    assert r.status_code in (200, 201), r.text[:200]
    return r.json()["data"]["id"], email


def test_owner_sets_staff_password_and_signs_them_out(client):
    _, owner = _company()
    access, _ = _tokens(client, owner)
    sid, email = _staff(client, access)
    old_refresh = _login(client, email, "Staff-Pass-123").json()["refresh_token"]
    r = client.patch(f"/api/v1/team/{sid}/password", headers=auth(access), json={"new_password": "Brand-New-456"})
    assert r.status_code == 200, r.text[:200]
    assert _login(client, email, "Staff-Pass-123").status_code == 401
    assert _login(client, email, "Brand-New-456").status_code == 200
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh}).status_code == 401


def test_set_password_needs_8_characters(client):
    _, owner = _company()
    access, _ = _tokens(client, owner)
    sid, _ = _staff(client, access)
    assert client.patch(f"/api/v1/team/{sid}/password", headers=auth(access), json={"new_password": "short"}).status_code == 422


def test_other_company_cannot_set_my_staff_password(client):
    _, a = _company()
    _, b = _company()
    a_access, _ = _tokens(client, a)
    b_access, _ = _tokens(client, b)
    sid, email = _staff(client, a_access)
    assert client.patch(f"/api/v1/team/{sid}/password", headers=auth(b_access), json={"new_password": "Hijacked-789"}).status_code == 404
    assert _login(client, email, "Hijacked-789").status_code == 401


@pytest.mark.parametrize("role", ["manager", "cashier", "accountant", "storekeeper"])
def test_staff_cannot_set_passwords(client, role):
    _, owner = _company()
    access, _ = _tokens(client, owner)
    target, _ = _staff(client, access)
    _, actor_email = _staff(client, access, role)
    actor = _login(client, actor_email, "Staff-Pass-123").json()["access_token"]
    assert client.patch(f"/api/v1/team/{target}/password", headers=auth(actor), json={"new_password": "Takeover-123"}).status_code == 403


def test_owner_cannot_set_owner_or_admin_password(client):
    _, a = _company()
    _, other_owner = _company()
    a_access, _ = _tokens(client, a)
    admin_email = _admin()
    with SessionLocal() as s:
        ids = [str(s.query(User).filter(User.email == e).first().id) for e in (a, other_owner, admin_email)]
    for uid in ids:
        assert client.patch(f"/api/v1/team/{uid}/password", headers=auth(a_access), json={"new_password": "Takeover-123"}).status_code == 404


def test_admin_sets_any_users_password(client):
    _, owner = _company()
    old_refresh = _tokens(client, owner)[1]
    admin_access, _ = _tokens(client, _admin())
    with SessionLocal() as s:
        uid = str(s.query(User).filter(User.email == owner).first().id)
    r = client.patch(f"/api/v1/admin/users/{uid}/password", headers=auth(admin_access), json={"new_password": "Admin-Set-123"})
    assert r.status_code == 200, r.text[:200]
    assert _login(client, owner, "Admin-Set-123").status_code == 200
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": old_refresh}).status_code == 401


def test_only_admin_uses_admin_set_password(client):
    _, owner = _company()
    _, victim = _company()
    access, _ = _tokens(client, owner)
    with SessionLocal() as s:
        uid = str(s.query(User).filter(User.email == victim).first().id)
    assert client.patch(f"/api/v1/admin/users/{uid}/password", headers=auth(access), json={"new_password": "Takeover-123"}).status_code == 403


# ── Platform admin: companies and their people ───────────────────────────────

def _admin_h(client):
    return auth(_tokens(client, _admin())[0])


def _uid(email):
    with SessionLocal() as s:
        return str(s.query(User).filter(User.email == email).first().id)


def _admin_company(client, h):
    email = f"own-{uuid.uuid4().hex[:8]}@sectest.example.com"
    r = client.post("/api/v1/admin/shops", headers=h, json={
        "shop_name": "Admin Co", "phone": "0788123456", "tin": "123456789",
        "owner_email": email, "owner_password": PASSWORD, "owner_name": "Owner"})
    assert r.status_code == 200, r.text[:200]
    return r.json()["data"]["shop_id"], email


def _admin_staff(client, h, sid, role="cashier"):
    r = client.post("/api/v1/admin/users", headers=h, json={
        "shop_id": sid, "email": f"st-{uuid.uuid4().hex[:8]}@sectest.example.com", "password": PASSWORD, "role": role})
    assert r.status_code == 200, r.text[:200]
    return r.json()["data"]


def _insert(engine, table, sid):
    from sqlalchemy import text
    with engine.begin() as c:
        c.execute(text(f"INSERT INTO {table} (id, shop_id, created_at) VALUES (:i, :s, now())"),
                  {"i": str(uuid.uuid4()), "s": sid})


@pytest.fixture
def business_tables():
    """Minimal business tables on the throwaway database, dropped afterwards
    when this test made them (the real services create the full ones)."""
    from sqlalchemy import text
    from app.db.shop_session import shop_engine
    made = []
    with shop_engine.begin() as c:
        for t in ("sales", "products"):
            if c.execute(text(f"SELECT to_regclass('public.{t}')")).scalar() is None:
                c.execute(text(f"CREATE TABLE {t} (id varchar PRIMARY KEY, shop_id varchar NOT NULL, "
                               f"created_at timestamptz NOT NULL DEFAULT now())"))
                made.append(t)
    yield lambda t, sid: _insert(shop_engine, t, sid)
    with shop_engine.begin() as c:
        for t in made:
            c.execute(text(f"DROP TABLE {t}"))


def test_admin_crud_round_trip(client):
    h = _admin_h(client)
    sid, owner = _admin_company(client, h)
    r = client.patch(f"/api/v1/admin/shops/{sid}", headers=h, json={"name": "Renamed Co"})
    assert r.json()["data"]["name"] == "Renamed Co"
    staff = _admin_staff(client, h, sid)
    assert staff["shop_name"] == "Renamed Co"
    # Every reply keeps the person's company (the list used to lose it).
    for r in (client.patch(f"/api/v1/admin/users/{staff['id']}/role", headers=h, json={"role": "manager"}),
              client.patch(f"/api/v1/admin/users/{staff['id']}/toggle", headers=h),
              client.patch(f"/api/v1/admin/users/{staff['id']}", headers=h, json={"name": "New Name"})):
        assert r.status_code == 200, r.text[:200]
        assert r.json()["data"]["shop_name"] == "Renamed Co"
    listed = {u["id"]: u for u in client.get("/api/v1/admin/users", headers=h).json()["data"]}
    assert listed[staff["id"]]["role"] == "manager" and listed[staff["id"]]["name"] == "New Name"
    assert listed[_uid(owner)]["shop_id"] == sid


@pytest.mark.parametrize("how", ["create", "promote"])
def test_company_people_never_become_platform_admin(client, how):
    h = _admin_h(client)
    sid, _ = _admin_company(client, h)
    if how == "create":
        r = client.post("/api/v1/admin/users", headers=h, json={
            "shop_id": sid, "email": f"x-{uuid.uuid4().hex[:8]}@sectest.example.com",
            "password": PASSWORD, "role": "admin"})
    else:
        staff = _admin_staff(client, h, sid)
        r = client.patch(f"/api/v1/admin/users/{staff['id']}/role", headers=h, json={"role": "admin"})
    assert r.status_code == 422
    with SessionLocal() as s:
        assert s.query(User).filter(User.shop_id == sid, User.role == "admin").count() == 0


def test_platform_admin_gets_no_company_role(client):
    h = _admin_h(client)
    other = _uid(_admin())
    assert client.patch(f"/api/v1/admin/users/{other}/role", headers=h, json={"role": "owner"}).status_code == 400


def test_deleting_a_signed_in_user_works(client):
    h = _admin_h(client)
    sid, owner = _admin_company(client, h)
    staff = _admin_staff(client, h, sid)
    _tokens(client, staff["email"])  # has a session now
    r = client.delete(f"/api/v1/admin/users/{staff['id']}", headers=h)
    assert r.status_code == 200, r.text[:200]
    # Only that person goes: the company and its owner stay.
    with ShopSessionLocal() as s:
        assert s.query(Shop).filter(Shop.id == sid).count() == 1
    assert _login(client, owner).status_code == 200


def test_company_must_be_off_and_empty_to_delete(client, business_tables):
    h = _admin_h(client)
    sid, owner = _admin_company(client, h)
    _tokens(client, owner)
    assert client.delete(f"/api/v1/admin/shops/{sid}", headers=h).status_code == 409  # still on
    assert client.patch(f"/api/v1/admin/shops/{sid}/toggle", headers=h).json()["data"]["is_active"] is False
    business_tables("sales", sid)
    r = client.delete(f"/api/v1/admin/shops/{sid}", headers=h)
    assert r.status_code == 409 and r.json()["detail"]["records"] == {"sales": 1}
    with ShopSessionLocal() as s:
        assert s.query(Shop).filter(Shop.id == sid).count() == 1  # nothing deleted


def test_empty_company_with_signed_in_people_deletes(client):
    h = _admin_h(client)
    sid, owner = _admin_company(client, h)
    _tokens(client, owner)
    client.patch(f"/api/v1/admin/shops/{sid}/toggle", headers=h)
    r = client.delete(f"/api/v1/admin/shops/{sid}", headers=h)
    assert r.status_code == 200, r.text[:200]
    assert _login(client, owner).status_code == 401


def test_turning_off_signs_people_out(client):
    h = _admin_h(client)
    sid, owner = _admin_company(client, h)
    staff = _admin_staff(client, h, sid)
    _, owner_refresh = _tokens(client, owner)
    _, staff_refresh = _tokens(client, staff["email"])
    client.patch(f"/api/v1/admin/users/{staff['id']}/toggle", headers=h)
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": staff_refresh}).status_code == 401
    client.patch(f"/api/v1/admin/shops/{sid}/toggle", headers=h)
    assert client.post("/api/v1/auth/refresh", json={"refresh_token": owner_refresh}).status_code in (401, 403)
    assert _login(client, owner).status_code == 403


def test_user_edit_checks_email(client):
    h = _admin_h(client)
    sid, owner = _admin_company(client, h)
    staff = _admin_staff(client, h, sid)
    assert client.patch(f"/api/v1/admin/users/{staff['id']}", headers=h, json={"email": "not-an-email"}).status_code == 422
    assert client.patch(f"/api/v1/admin/users/{staff['id']}", headers=h, json={"email": owner.upper()}).status_code == 400
    # Only name and email: not the role, the company or the active flag.
    client.patch(f"/api/v1/admin/users/{staff['id']}", headers=h, json={"role": "owner", "shop_id": None, "is_active": False})
    with SessionLocal() as s:
        u = s.query(User).filter(User.id == staff["id"]).first()
        assert (u.role, str(u.shop_id), u.is_active) == ("cashier", sid, True)


def test_admin_actions_are_logged(client):
    h = _admin_h(client)
    sid, _ = _admin_company(client, h)
    staff = _admin_staff(client, h, sid)
    client.patch(f"/api/v1/admin/users/{staff['id']}/role", headers=h, json={"role": "manager"})
    client.patch(f"/api/v1/admin/shops/{sid}/toggle", headers=h)
    log = client.get("/api/v1/admin/audit", headers=h).json()["data"]
    mine = [(e["action"], e["target_id"]) for e in log]
    assert ("shop.create", sid) in mine and ("shop.disable", sid) in mine
    assert ("user.create", staff["id"]) in mine
    role = next(e for e in log if e["action"] == "user.role" and e["target_id"] == staff["id"])
    assert role["detail"] == {"from": "cashier", "to": "manager"}


def test_insights_track_each_company(client, business_tables):
    h = _admin_h(client)
    busy, _ = _admin_company(client, h)
    quiet, _ = _admin_company(client, h)
    for _ in range(3):
        business_tables("sales", busy)
    business_tables("products", busy)
    business_tables("products", quiet)  # setting up: products, no sale yet
    r = client.get("/api/v1/admin/insights", headers=h)
    assert r.status_code == 200, r.text[:200]
    d = r.json()["data"]
    by = {c["shop_id"]: c for c in d["companies"]}
    assert by[busy]["sales_30d"] == 3 and by[busy]["products"] == 1 and by[busy]["health"] == "active"
    assert by[busy]["monthly_sales"][-1] == 3 and by[busy]["setup"]["first_sale"] is True
    assert by[quiet]["sales_total"] == 0 and by[quiet]["health"] == "new"
    assert len(d["timeline"]) == 12 and d["timeline"][-1]["sales"] >= 3
    # Activity only: no money figures for any company.
    assert not any(k in by[busy] for k in ("revenue", "profit", "total_amount"))


@pytest.mark.parametrize("path", ["/api/v1/admin/insights", "/api/v1/admin/audit"])
def test_insights_and_log_are_admin_only(client, path):
    _, owner = _company()
    access, _ = _tokens(client, owner)
    assert client.get(path, headers=auth(access)).status_code == 403
