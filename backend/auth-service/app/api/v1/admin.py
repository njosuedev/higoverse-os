from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_bearer import get_current_user
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
        if u.role in ("owner", "admin") and sid not in owner_emails:
            owner_emails[sid] = u.email

    return {
        "success": True,
        "data": [
            _fmt_shop(s, owner_emails.get(str(s.id)), user_counts.get(str(s.id), 0))
            for s in shops
        ],
    }


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
    shop.is_active = not shop.is_active
    shop.updated_at = datetime.now(timezone.utc)
    shop_db.commit()
    shop_db.refresh(shop)

    users = db.query(User).filter(User.shop_id == shop.id).all()
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
    shop_db.delete(shop)
    shop_db.commit()

    # also remove from auth db mirror
    auth_shop = db.query(Shop).filter(Shop.id == shop_id).first()
    if auth_shop:
        db.delete(auth_shop)
        db.commit()

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
