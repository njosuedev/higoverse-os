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
