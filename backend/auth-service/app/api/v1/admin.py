from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_bearer import get_current_user
from app.core.product_client import sync_shop_status
from app.db.deps import get_db, get_shop_db
from app.models.shop import Shop
from app.models.user import User

router = APIRouter()


def require_admin(current_user=Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def _fmt_shop(s: Shop, owner_email: str | None = None, user_count: int = 0) -> dict:
    return {
        "id":           str(s.id),
        "name":         s.name,
        "email":        s.email,
        "phone":        s.phone,
        "address":      s.address,
        "description":  s.description,
        "logo_url":     s.logo_url,
        "is_active":    s.is_active,
        "owner_email":  owner_email,
        "user_count":   user_count,
        "created_at":   s.created_at.isoformat() if s.created_at else None,
        "updated_at":   s.updated_at.isoformat() if s.updated_at else None,
        "last_seen_at": s.last_seen_at.isoformat() if s.last_seen_at else None,
    }


def _fmt_user(u: User, shop_name: str | None = None) -> dict:
    return {
        "id":         str(u.id),
        "email":      u.email,
        "role":       u.role,
        "is_active":  u.is_active,
        "shop_id":    str(u.shop_id) if u.shop_id else None,
        "shop_name":  shop_name,
        "created_at": u.created_at.isoformat() if u.created_at else None,
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
        # Show owner/customer applicant email so admin can identify who applied
        if u.role in ("owner", "admin", "customer") and sid not in owner_emails:
            owner_emails[sid] = u.email

    return {
        "success": True,
        "data": [
            _fmt_shop(s, owner_emails.get(str(s.id)), user_counts.get(str(s.id), 0))
            for s in shops
        ],
    }


# ── Update shop fields (admin — used for rejection notes) ──
@router.patch("/shops/{shop_id}")
def admin_patch_shop(
    shop_id: str,
    payload: dict,
    shop_db: Session = Depends(get_shop_db),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    shop = shop_db.query(Shop).filter(Shop.id == shop_id).first()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    allowed = {"name", "phone", "address", "description", "logo_url", "is_active"}
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
        db.commit()

    if "is_active" in payload:
        sync_shop_status(str(shop.id), shop.is_active)

    users = db.query(User).filter(User.shop_id == shop.id).all()
    owner = next((u for u in users if u.role in ("owner", "admin", "customer")), None)
    return {"success": True, "data": _fmt_shop(shop, owner.email if owner else None, len(users))}


# ── Toggle shop active/inactive ───────────────────────────
@router.patch("/shops/{shop_id}/toggle")
def admin_toggle_shop(
    shop_id: str,
    shop_db: Session = Depends(get_shop_db),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
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

    users = db.query(User).filter(User.shop_id == shop.id).all()

    if activating:
        # Promote any customer-role users attached to this shop to owner
        for u in users:
            if u.role == "customer":
                u.role = "owner"

    db.commit()

    sync_shop_status(str(shop.id), activating)

    user_count = len(users)
    owner = next((u for u in users if u.role in ("owner", "admin")), None)
    return {"success": True, "data": _fmt_shop(shop, owner.email if owner else None, user_count)}


# ── Delete a shop ─────────────────────────────────────────
@router.delete("/shops/{shop_id}")
def admin_delete_shop(
    shop_id: str,
    shop_db: Session = Depends(get_shop_db),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    shop = shop_db.query(Shop).filter(Shop.id == shop_id).first()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    # Delete users first (FK: users.shop_id → shops.id in auth_db)
    db.query(User).filter(User.shop_id == shop_id).delete(synchronize_session=False)
    db.flush()

    # Remove shop mirror from auth_db
    auth_shop = db.query(Shop).filter(Shop.id == shop_id).first()
    if auth_shop:
        db.delete(auth_shop)
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
    return {
        "success": True,
        "data": [_fmt_user(u, shops.get(str(u.shop_id))) for u in users],
    }


# ── Update user fields (admin — e.g. scramble email) ─────
@router.patch("/users/{user_id}")
def admin_patch_user(
    user_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    allowed = {"email", "name", "is_active"}
    for field, value in payload.items():
        if field in allowed:
            setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return {"success": True, "data": _fmt_user(user)}


# ── Hard delete a user ────────────────────────────────────
@router.delete("/users/{user_id}")
def admin_delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if str(user.id) == str(current_admin.id):
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    db.delete(user)
    db.commit()
    return {"success": True, "message": "User deleted"}


# ── Toggle user active/inactive ───────────────────────────
@router.patch("/users/{user_id}/toggle")
def admin_toggle_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if str(user.id) == str(current_admin.id):
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")
    user.is_active = not user.is_active
    db.commit()
    db.refresh(user)
    return {"success": True, "data": _fmt_user(user)}


# ── Update user role ──────────────────────────────────────
@router.patch("/users/{user_id}/role")
def admin_update_user_role(
    user_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
):
    new_role = payload.get("role", "").strip()
    if new_role not in ("admin", "owner", "staff"):
        raise HTTPException(status_code=422, detail="Role must be admin, owner, or staff")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if str(user.id) == str(current_admin.id):
        raise HTTPException(status_code=400, detail="Cannot change your own role")
    user.role = new_role
    db.commit()
    db.refresh(user)
    return {"success": True, "data": _fmt_user(user)}
