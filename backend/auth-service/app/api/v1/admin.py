import logging
import uuid as _uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from app.core.auth_bearer import get_current_user
from app.core.permissions import default_permissions
from app.core.security import hash_password
from app.services.auth_service import revoke_all_sessions
from app.services import admin_insights
from app.db.deps import get_db, get_shop_db
from app.models.admin_audit import AdminAudit
from app.models.refresh_token import RefreshToken
from app.models.shop import Shop
from app.models.user import User
from app.schemas.shop import AdminCreateShopRequest, AdminShopPatch
from app.core.company import shop_tin
from app.schemas.user import AdminCreateUserRequest

# The roles a company's people can have. "admin" is the platform admin: no
# company, and never given to anyone in one (that would hand them control of
# every company on Higoverse).
SHOP_ROLES = {"owner", "manager", "cashier", "storekeeper", "accountant"}

# Records that make a company more than an empty shell: while it has any,
# it can be turned off but not deleted (its data stays).
_BUSINESS_TABLES = ("products", "sales", "purchases", "expenses", "proformas", "suppliers")

logger = logging.getLogger("auth-service")
router = APIRouter()


def require_admin(current_user=Depends(get_current_user)):
    if current_user.role != "admin" or not current_user.is_active:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def _audit(db: Session, admin: User, action: str, target_type: str, target_id, label: str | None, **detail):
    """Notes what the admin did (committed with the change it describes)."""
    db.add(AdminAudit(
        admin_id=admin.id, admin_email=admin.email, action=action, target_type=target_type,
        target_id=str(target_id) if target_id else None, target_label=(label or "")[:255] or None,
        detail=detail or None,
    ))


def _fmt_shop(s: Shop, owner_email: str | None = None, user_count: int = 0) -> dict:
    return {
        "id":             str(s.id),
        "name":           s.name,
        "email":          s.email,
        "phone":          s.phone,
        "tin":            shop_tin(s),
        "address":        s.address,
        "description":    s.description,
        "logo_url":       s.logo_url,
        "layout":         s.layout or "retail",
        "is_active":      s.is_active,
        "email_verified": bool(s.email_verified),
        "owner_email":    owner_email,
        "user_count":     user_count,
        "created_at":     s.created_at.isoformat() if s.created_at else None,
        "updated_at":     s.updated_at.isoformat() if s.updated_at else None,
        "last_seen_at":   s.last_seen_at.isoformat() if s.last_seen_at else None,
    }


def _fmt_user(u: User, shop_name: str | None = None, last_active=None) -> dict:
    return {
        "id":          str(u.id),
        "email":       u.email,
        "name":        u.name,
        "role":        u.role,
        "permissions": u.permissions or default_permissions(u.role),
        "is_active":   u.is_active,
        "shop_id":     str(u.shop_id) if u.shop_id else None,
        "shop_name":   shop_name,
        "created_at":  u.created_at.isoformat() if u.created_at else None,
        "last_active_at": last_active.isoformat() if last_active else None,
    }


def _shop_name(shop_db: Session, shop_id) -> str | None:
    if not shop_id:
        return None
    s = shop_db.query(Shop).filter(Shop.id == shop_id).first()
    return s.name if s else None


def _shop_reply(db: Session, shop: Shop) -> dict:
    users = db.query(User).filter(User.shop_id == shop.id).all()
    owner = next((u for u in users if u.role in ("owner", "admin")), None)
    return _fmt_shop(shop, owner.email if owner else None, len(users))


def _last_active(db: Session) -> dict[str, datetime]:
    """When each user last signed in or renewed their session."""
    rows = (db.query(RefreshToken.user_id, func.max(RefreshToken.created_at))
              .group_by(RefreshToken.user_id).all())
    return {str(uid): at for uid, at in rows if uid and at}


# ── Create a shop + its first Owner staff member ──────────
# The only way a shop comes into existence — there is no self-registration.
@router.post("/shops")
def admin_create_shop(
    payload: AdminCreateShopRequest,
    shop_db: Session = Depends(get_shop_db),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    needs_account = payload.owner_email is not None

    if needs_account:
        if shop_db.query(Shop).filter(Shop.email == payload.owner_email).first():
            raise HTTPException(status_code=400, detail="A shop with this email already exists")
        if db.query(User).filter(User.email == payload.owner_email).first():
            raise HTTPException(status_code=400, detail="A staff account with this email already exists")

    shop_id = _uuid.uuid4()
    now = datetime.now(timezone.utc)

    shop_fields = dict(
        name=payload.shop_name,
        email=payload.owner_email,
        phone=payload.phone,
        tin=payload.tin,
        address=payload.address,
        description=payload.description,
        logo_url=payload.logo_url,
        layout=payload.layout,
        is_active=True,
        email_verified=False,
    )

    # Shop_db is the source of truth; the auth_db copy is a read-only mirror
    # kept in sync so cross-DB queries (e.g. login's shop-active check) work
    # without a cross-database FK.
    shop_db.add(Shop(id=shop_id, created_at=now, **shop_fields))
    db.add(Shop(id=shop_id, created_at=now, **shop_fields))

    if needs_account:
        owner = User(
            name=payload.owner_name,
            email=payload.owner_email,
            password_hash=hash_password(payload.owner_password),
            shop_id=shop_id,
            role="owner",
            permissions=default_permissions("owner"),
            is_active=True,
        )
        db.add(owner)

    _audit(db, admin, "shop.create", "shop", shop_id, payload.shop_name, owner=payload.owner_email, layout=payload.layout)
    shop_db.commit()
    db.commit()

    return {
        "success": True,
        "message": "Shop created",
        "data": {
            "shop_id":     str(shop_id),
            "shop_name":   payload.shop_name,
            "owner_email": payload.owner_email,
        },
    }


# ── System-wide stats ─────────────────────────────────────
@router.get("/stats")
def admin_stats(
    db: Session = Depends(get_db),
    shop_db: Session = Depends(get_shop_db),
    _: User = Depends(require_admin),
):
    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.is_active == True).count()
    total_shops = shop_db.query(Shop).count()
    active_shops = shop_db.query(Shop).filter(Shop.is_active == True).count()

    now = datetime.now(timezone.utc)
    online_threshold = now.timestamp() - 300  # 5 minutes
    online_shops = [
        s for s in shop_db.query(Shop).all()
        if s.last_seen_at and s.last_seen_at.timestamp() > online_threshold
    ]

    return {
        "success": True,
        "data": {
            "total_users":    total_users,
            "active_users":   active_users,
            "inactive_users": total_users - active_users,
            "total_shops":    total_shops,
            "active_shops":   active_shops,
            "inactive_shops": total_shops - active_shops,
            "online_shops":   len(online_shops),
        },
    }


# ── How every company is doing (usage, health, growth) ───
@router.get("/insights")
def admin_insights_view(
    db: Session = Depends(get_db),
    shop_db: Session = Depends(get_shop_db),
    _: User = Depends(require_admin),
):
    shops = shop_db.query(Shop).all()
    users = db.query(User).all()
    seen = _last_active(db)
    # A company's people: the latest any of them was signed in.
    by_shop: dict[str, datetime] = {}
    for u in users:
        at = seen.get(str(u.id))
        if u.shop_id and at:
            k = str(u.shop_id)
            by_shop[k] = max(by_shop.get(k, at), at)
    return {"success": True, "data": admin_insights.build(shops, users, shop_db, by_shop)}


# ── What the admin did ────────────────────────────────────
@router.get("/audit")
def admin_audit_log(
    limit: int = Query(200, ge=1, le=1000),
    target_id: Optional[str] = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    q = db.query(AdminAudit)
    if target_id:
        q = q.filter(AdminAudit.target_id == target_id)
    rows = q.order_by(AdminAudit.at.desc()).limit(limit).all()
    return {"success": True, "data": [{
        "id": str(r.id), "at": r.at.isoformat() if r.at else None, "admin_email": r.admin_email,
        "action": r.action, "target_type": r.target_type, "target_id": r.target_id,
        "target_label": r.target_label, "detail": r.detail or {},
    } for r in rows]}


# ── All shops (admin view, includes inactive + owner info) ──
@router.get("/shops")
def admin_list_shops(
    shop_db: Session = Depends(get_shop_db),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    shops = shop_db.query(Shop).order_by(Shop.created_at.desc()).all()

    # Build per-shop user map from auth DB
    users = db.query(User).all()
    user_counts: dict[str, int] = {}
    owner_emails: dict[str, str] = {}
    for u in users:
        sid = str(u.shop_id) if u.shop_id else None
        if not sid:
            continue
        user_counts[sid] = user_counts.get(sid, 0) + 1
        if u.role in ("owner", "admin") and sid not in owner_emails:
            owner_emails[sid] = u.email

    return {
        "success": True,
        "data": [
            _fmt_shop(s, owner_emails.get(str(s.id)), user_counts.get(str(s.id), 0))
            for s in shops
        ],
    }


# ── Update shop fields ────────────────────────────────────
@router.patch("/shops/{shop_id}")
def admin_patch_shop(
    shop_id: str,
    body: AdminShopPatch,
    shop_db: Session = Depends(get_shop_db),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    shop = shop_db.query(Shop).filter(Shop.id == shop_id).first()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    # Validated (name, phone, TIN, layout); only the fields sent change.
    payload = body.model_dump(exclude_unset=True)
    allowed = set(AdminShopPatch.model_fields)
    changed = sorted(f for f, v in payload.items() if f in allowed and getattr(shop, f, None) != v)
    for field, value in payload.items():
        if field in allowed:
            setattr(shop, field, value)
    shop.updated_at = datetime.now(timezone.utc)
    shop_db.commit()
    shop_db.refresh(shop)

    # Mirror changes in auth_db
    auth_shop = db.query(Shop).filter(Shop.id == shop_id).first()
    if auth_shop:
        for field, value in payload.items():
            if field in allowed:
                setattr(auth_shop, field, value)
        auth_shop.updated_at = shop.updated_at
    if changed:
        _audit(db, admin, "shop.edit", "shop", shop.id, shop.name, fields=changed)
    db.commit()

    return {"success": True, "data": _shop_reply(db, shop)}


# ── Toggle shop active/inactive ───────────────────────────
@router.patch("/shops/{shop_id}/toggle")
def admin_toggle_shop(
    shop_id: str,
    shop_db: Session = Depends(get_shop_db),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    shop = shop_db.query(Shop).filter(Shop.id == shop_id).first()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    activating = not shop.is_active
    shop.is_active = activating
    shop.updated_at = datetime.now(timezone.utc)
    shop_db.commit()
    shop_db.refresh(shop)

    # Mirror is_active on auth_db copy so FK-linked queries stay consistent
    auth_shop = db.query(Shop).filter(Shop.id == shop_id).first()
    if auth_shop:
        auth_shop.is_active = activating
        auth_shop.updated_at = shop.updated_at
    _audit(db, admin, "shop.enable" if activating else "shop.disable", "shop", shop.id, shop.name)
    db.commit()

    # Turned off: its people are signed out on every device now (their
    # sessions can't be renewed anyway; this ends them without waiting).
    if not activating:
        for u in db.query(User).filter(User.shop_id == shop.id).all():
            revoke_all_sessions(db, u.id)

    return {"success": True, "data": _shop_reply(db, shop)}


# ── Verify a shop's email (admin) ─────────────────────────
@router.patch("/shops/{shop_id}/verify-email")
def admin_verify_shop_email(
    shop_id: str,
    shop_db: Session = Depends(get_shop_db),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    shop = shop_db.query(Shop).filter(Shop.id == shop_id).first()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    if not shop.email:
        raise HTTPException(status_code=400, detail="Shop has no email to verify")

    shop.email_verified = True
    shop.updated_at = datetime.now(timezone.utc)
    shop_db.commit()
    shop_db.refresh(shop)

    auth_shop = db.query(Shop).filter(Shop.id == shop_id).first()
    if auth_shop:
        auth_shop.email_verified = True
        auth_shop.updated_at = shop.updated_at
    _audit(db, admin, "shop.verify_email", "shop", shop.id, shop.name, email=shop.email)
    db.commit()

    return {"success": True, "data": _shop_reply(db, shop)}


def _business_records(shop_db: Session, shop_id: str) -> dict[str, int]:
    """How many records of each kind the company has (only tables that exist)."""
    out = {}
    for t in _BUSINESS_TABLES:
        if shop_db.execute(text(f"SELECT to_regclass('public.{t}')")).scalar() is None:
            continue
        n = shop_db.execute(text(f"SELECT count(*) FROM {t} WHERE shop_id = :sid"), {"sid": str(shop_id)}).scalar()
        if n:
            out[t] = n
    return out


# ── Delete a shop ─────────────────────────────────────────
# Only an empty company (made by mistake, or a test) can be deleted, and only
# once it is turned off. A company with records is turned off instead: its
# data stays, and turning it back on restores everything.
@router.delete("/shops/{shop_id}")
def admin_delete_shop(
    shop_id: str,
    shop_db: Session = Depends(get_shop_db),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    shop = shop_db.query(Shop).filter(Shop.id == shop_id).first()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    if shop.is_active:
        raise HTTPException(status_code=409, detail="Turn this company off before deleting it.")
    records = _business_records(shop_db, shop.id)
    if records:
        summary = ", ".join(f"{n} {t}" for t, n in records.items())
        raise HTTPException(status_code=409, detail={
            "message": f"This company has records ({summary}), so it can't be deleted. Keep it turned off instead.",
            "records": records,
        })

    members = db.query(User).filter(User.shop_id == shop_id).all()
    # Sessions first (refresh_tokens.user_id → users.id), then its people.
    for u in members:
        db.query(RefreshToken).filter(RefreshToken.user_id == u.id).delete(synchronize_session=False)
    db.query(User).filter(User.shop_id == shop_id).delete(synchronize_session=False)
    db.flush()

    # Remove shop mirror from auth_db
    auth_shop = db.query(Shop).filter(Shop.id == shop_id).first()
    if auth_shop:
        db.delete(auth_shop)
    _audit(db, admin, "shop.delete", "shop", shop.id, shop.name, users=[u.email for u in members])
    db.commit()

    # Remove shop from shop_db (no FK dependencies there)
    shop_db.delete(shop)
    shop_db.commit()

    return {"success": True, "message": "Shop deleted"}


# ── All users ─────────────────────────────────────────────
@router.get("/users")
def admin_list_users(
    db: Session = Depends(get_db),
    shop_db: Session = Depends(get_shop_db),
    _: User = Depends(require_admin),
):
    users = db.query(User).order_by(User.created_at.desc()).all()
    shops = {str(s.id): s.name for s in shop_db.query(Shop).all()}
    seen = _last_active(db)
    return {
        "success": True,
        "data": [_fmt_user(u, shops.get(str(u.shop_id)), seen.get(str(u.id))) for u in users],
    }


# ── Register a staff member into an existing shop ─────────
@router.post("/users")
def admin_create_user(
    payload: AdminCreateUserRequest,
    db: Session = Depends(get_db),
    shop_db: Session = Depends(get_shop_db),
    admin: User = Depends(require_admin),
):
    if payload.role not in SHOP_ROLES:
        raise HTTPException(status_code=422, detail=f"Role must be one of: {', '.join(sorted(SHOP_ROLES))}")
    if len(payload.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")

    shop = shop_db.query(Shop).filter(Shop.id == payload.shop_id).first()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    if db.query(User).filter(func.lower(User.email) == payload.email.lower()).first():
        raise HTTPException(status_code=400, detail="A staff account with this email already exists")

    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
        shop_id=shop.id,
        role=payload.role,
        permissions=default_permissions(payload.role),
        is_active=True,
    )
    db.add(user)
    db.flush()
    _audit(db, admin, "user.create", "user", user.id, user.email, role=user.role, shop=shop.name)
    db.commit()
    db.refresh(user)

    return {"success": True, "message": "User created", "data": _fmt_user(user, shop.name)}


class AdminUserPatch(BaseModel):
    email: Optional[EmailStr] = None
    name: Optional[str] = Field(None, max_length=255)


# ── Update a user's name or email ─────────────────────────
@router.patch("/users/{user_id}")
def admin_patch_user(
    user_id: str,
    payload: AdminUserPatch,
    db: Session = Depends(get_db),
    shop_db: Session = Depends(get_shop_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    changes = payload.model_dump(exclude_unset=True)
    if changes.get("email") and changes["email"].lower() != (user.email or "").lower():
        taken = db.query(User).filter(func.lower(User.email) == changes["email"].lower(), User.id != user.id).first()
        if taken:
            raise HTTPException(status_code=400, detail="Another account already uses this email")
    if "name" in changes:
        changes["name"] = (changes["name"] or "").strip() or None
    before = {k: getattr(user, k) for k in changes}
    for field, value in changes.items():
        setattr(user, field, value)
    changed = {k: {"from": before[k], "to": v} for k, v in changes.items() if before[k] != v}
    if changed:
        _audit(db, admin, "user.edit", "user", user.id, user.email, **changed)
    db.commit()
    db.refresh(user)
    return {"success": True, "data": _fmt_user(user, _shop_name(shop_db, user.shop_id))}


# ── Delete a user ─────────────────────────────────────────
@router.delete("/users/{user_id}")
def admin_delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if str(user.id) == str(admin.id):
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    # Their sessions go first (refresh_tokens.user_id → users.id): deleting
    # anyone who had ever signed in used to fail with a server error.
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id).delete(synchronize_session=False)
    _audit(db, admin, "user.delete", "user", user.id, user.email, role=user.role,
           shop_id=str(user.shop_id) if user.shop_id else None)
    db.delete(user)
    db.commit()
    return {"success": True, "message": "User deleted"}


class AdminNewPassword(BaseModel):
    new_password: str = Field(..., min_length=8, max_length=128)


@router.patch("/users/{user_id}/password")
def admin_set_password(
    user_id: str,
    payload: AdminNewPassword,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    """Sets a new password for any user (when they can't reset it by email).
    They are signed out everywhere."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if str(user.id) == str(current_admin.id):
        raise HTTPException(status_code=400, detail="Use Change password in Settings for your own account.")
    user.password_hash = hash_password(payload.new_password)
    _audit(db, current_admin, "user.password", "user", user.id, user.email)
    db.commit()
    revoke_all_sessions(db, user.id)
    logger.warning("security: password set by admin user=%s by=%s", user.id, current_admin.id)
    return {"success": True, "message": "Password changed."}


# ── Toggle user active/inactive ───────────────────────────
@router.patch("/users/{user_id}/toggle")
def admin_toggle_user(
    user_id: str,
    db: Session = Depends(get_db),
    shop_db: Session = Depends(get_shop_db),
    current_admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if str(user.id) == str(current_admin.id):
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")
    user.is_active = not user.is_active
    _audit(db, current_admin, "user.enable" if user.is_active else "user.disable", "user", user.id, user.email)
    db.commit()
    db.refresh(user)
    if not user.is_active:
        revoke_all_sessions(db, user.id)  # signed out on every device
    return {"success": True, "data": _fmt_user(user, _shop_name(shop_db, user.shop_id))}


# ── Update user role ──────────────────────────────────────
@router.patch("/users/{user_id}/role")
def admin_update_user_role(
    user_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    shop_db: Session = Depends(get_shop_db),
    current_admin: User = Depends(require_admin),
):
    new_role = str(payload.get("role", "")).strip()
    if new_role not in SHOP_ROLES:
        raise HTTPException(status_code=422, detail=f"Role must be one of: {', '.join(sorted(SHOP_ROLES))}")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if str(user.id) == str(current_admin.id):
        raise HTTPException(status_code=400, detail="Cannot change your own role")
    # Company roles are for a company's people; a platform admin isn't one.
    if user.role == "admin" or not user.shop_id:
        raise HTTPException(status_code=400, detail="This account isn't in a company, so it has no company role.")
    old = user.role
    user.role = new_role
    user.permissions = default_permissions(new_role)
    if old != new_role:
        _audit(db, current_admin, "user.role", "user", user.id, user.email, **{"from": old, "to": new_role})
    db.commit()
    db.refresh(user)
    return {"success": True, "data": _fmt_user(user, _shop_name(shop_db, user.shop_id))}
