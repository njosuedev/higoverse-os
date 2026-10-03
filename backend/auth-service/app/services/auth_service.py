import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.permissions import default_permissions
from app.core.security import hash_password, verify_password, create_access_token
from app.models.refresh_token import RefreshToken
from app.models.shop import Shop
from app.models.user import User


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _issue_tokens(db: Session, user: User, layout: str = "retail") -> dict:
    """Build the access token + a freshly-minted, DB-backed refresh token for
    a staff user. Shared by login and /auth/refresh so both return the exact
    same claim set. `layout` is the shop's business layout — services use it
    (with `role`) to keep car companies' financials from their staff."""
    permissions = user.permissions or default_permissions(user.role)

    access_token = create_access_token({
        "sub":         str(user.id),
        "staff_id":    str(user.id),
        "shop_id":     str(user.shop_id) if user.shop_id else None,
        "email":       user.email,
        "role":        user.role,
        "name":        user.name,
        "permissions": permissions,
        "layout":      layout,
    })

    raw_refresh = secrets.token_urlsafe(48)
    db.add(RefreshToken(
        user_id=user.id,
        token=_hash_token(raw_refresh),
        expires_at=datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    ))
    db.commit()

    return {
        "access_token": access_token,
        "refresh_token": raw_refresh,
        "token_type": "bearer",
        "user": {
            "id":          str(user.id),
            "email":       user.email,
            "shop_id":     str(user.shop_id) if user.shop_id else None,
            "role":        user.role,
            "name":        user.name,
            "permissions": permissions,
        },
    }


# ----------------------------
# LOGIN (Shop Authentication)
# ----------------------------
def login_user(db: Session, shop_db: Session, email: str, password: str) -> dict:
    user = db.query(User).filter(User.email == email).first()

    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="This account is inactive. Contact your shop owner or platform administrator.")

    # Platform admins have no shop and skip the shop-active gate.
    if user.role != "admin":
        shop = shop_db.query(Shop).filter(Shop.id == user.shop_id).first() if user.shop_id else None
        if not shop or not shop.is_active:
            raise HTTPException(status_code=403, detail="This shop is not active. Contact your platform administrator.")
        return _issue_tokens(db, user, shop.layout or "retail")

    return _issue_tokens(db, user)


# ----------------------------
# REFRESH — rotate a valid refresh token for a new access token
# ----------------------------
def refresh_tokens(db: Session, shop_db: Session, raw_refresh_token: str) -> dict:
    token_hash = _hash_token(raw_refresh_token)
    record = db.query(RefreshToken).filter(RefreshToken.token == token_hash).first()

    now = datetime.now(timezone.utc)
    if not record or record.expires_at.replace(tzinfo=timezone.utc) < now:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    user = db.query(User).filter(User.id == record.user_id).first()
    if not user or not user.is_active:
        db.delete(record)
        db.commit()
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if user.role != "admin":
        shop = shop_db.query(Shop).filter(Shop.id == user.shop_id).first() if user.shop_id else None
        if not shop or not shop.is_active:
            db.delete(record)
            db.commit()
            raise HTTPException(status_code=403, detail="This shop is not active. Contact your platform administrator.")

    # Rotate: the old refresh token is single-use.
    db.delete(record)
    db.commit()

    layout = (shop.layout or "retail") if user.role != "admin" else "retail"
    return _issue_tokens(db, user, layout)


# ----------------------------
# LOGOUT — revoke a refresh token
# ----------------------------
def logout_user(db: Session, raw_refresh_token: str) -> None:
    token_hash = _hash_token(raw_refresh_token)
    db.query(RefreshToken).filter(RefreshToken.token == token_hash).delete()
    db.commit()
