import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.core.auth_bearer import get_current_user
from app.core.config import settings
from app.core.permissions import default_permissions
from app.core.security import verify_password, hash_password, create_access_token
from app.core.throttle import client_ip, login_failures, login_failures_any_ip, reset_failures, reset_requests, too_many
from app.db.deps import get_db, get_shop_db
from app.models.password_reset import PasswordReset
from app.models.shop import Shop
from app.models.user import User
from app.schemas.auth import (
    LoginRequest, RefreshRequest, LogoutRequest, ChangePasswordRequest,
    ForgotPasswordRequest, ResetPasswordRequest, UpdateProfileRequest,
)
from app.services.auth_service import login_user, refresh_tokens, logout_user
from app.utils.email import send_otp_email

logger = logging.getLogger("auth-service")

router = APIRouter()

# ----------------------------
# LOGIN
# ----------------------------
@router.post("/login")
def login(data: LoginRequest, request: Request, db: Session = Depends(get_db), shop_db: Session = Depends(get_shop_db)):
    # Slows password guessing: one email from one address gets a few tries,
    # then waits. Keyed on both so a stranger can't lock a real user out.
    email = data.email.lower()
    key = f"{email}|{client_ip(request)}"
    if login_failures.blocked(key) or login_failures_any_ip.blocked(email):
        raise too_many()
    try:
        result = login_user(db, shop_db, data.email, data.password)
    except HTTPException as exc:
        if exc.status_code == 401:
            login_failures.hit(key)
            login_failures_any_ip.hit(email)
        raise
    login_failures.clear(key)
    return result

# ----------------------------
# REFRESH — exchange a valid refresh token for a new access token
# ----------------------------
@router.post("/refresh")
def refresh(payload: RefreshRequest, db: Session = Depends(get_db), shop_db: Session = Depends(get_shop_db)):
    return refresh_tokens(db, shop_db, payload.refresh_token)

# ----------------------------
# LOGOUT — revoke the refresh token
# ----------------------------
@router.post("/logout")
def logout(payload: LogoutRequest, db: Session = Depends(get_db)):
    logout_user(db, payload.refresh_token)
    return {"success": True, "message": "Logged out"}

# ----------------------------
# CHANGE PASSWORD (authenticated)
# ----------------------------
@router.put("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=422, detail="New password must be at least 6 characters")
    current_user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"success": True, "message": "Password changed successfully"}


# ----------------------------
# FORGOT PASSWORD — send OTP
# ----------------------------
@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    # The same reply whether or not the email is registered, so this form
    # can't be used to find out who has an account.
    sent = {"success": True, "message": "If that email is registered, a code has been sent to it."}
    email = payload.email.lower()
    if reset_requests.hit(email) > reset_requests.limit:
        raise too_many()

    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        return sent

    # Invalidate any existing unused OTPs for this email
    db.query(PasswordReset).filter(
        PasswordReset.email == payload.email,
        PasswordReset.used == False,  # noqa: E712
    ).update({"used": True})

    # secrets, not random: the code is the only thing protecting the account.
    otp = f"{secrets.randbelow(10**6):06d}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    record = PasswordReset(email=payload.email, otp=otp, expires_at=expires_at)
    db.add(record)
    db.commit()
    reset_failures.clear(email)

    try:
        send_otp_email(payload.email, otp)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Email service is not configured. Please contact support.")
    except Exception:
        logger.exception("Sending the reset code failed")
        raise HTTPException(status_code=500, detail="The email could not be sent. Please try again later.")

    return sent

# ----------------------------
# RESET PASSWORD — verify OTP + set new password
# ----------------------------
@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    if len(payload.new_password) < 6:
        raise HTTPException(status_code=422, detail="Password must be at least 6 characters")

    now = datetime.now(timezone.utc)
    record = db.query(PasswordReset).filter(
        PasswordReset.email == payload.email,
        PasswordReset.otp == payload.otp,
        PasswordReset.used == False,  # noqa: E712
        PasswordReset.expires_at > now,
    ).first()

    if not record:
        # A 6-digit code falls to guessing without a limit: after a few
        # wrong codes every code sent to this email stops working.
        if reset_failures.hit(payload.email.lower()) >= reset_failures.limit:
            db.query(PasswordReset).filter(
                PasswordReset.email == payload.email,
                PasswordReset.used == False,  # noqa: E712
            ).update({"used": True})
            db.commit()
            raise HTTPException(status_code=429, detail="Too many wrong codes. Request a new code and try again.")
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.password_hash = hash_password(payload.new_password)
    record.used = True
    db.commit()
    reset_failures.clear(payload.email.lower())

    return {"success": True, "message": "Password reset successfully. You can now sign in."}

# ----------------------------
# UPDATE PROFILE (authenticated)
# ----------------------------
@router.put("/profile")
def update_profile(
    payload: UpdateProfileRequest,
    db: Session = Depends(get_db),
    shop_db: Session = Depends(get_shop_db),
    current_user=Depends(get_current_user),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name cannot be empty")

    current_user.name = name
    db.commit()

    permissions = current_user.permissions or default_permissions(current_user.role)
    # Same claim set as login/refresh — `layout` keeps car companies'
    # financials hidden from their staff (see auth_service._issue_tokens).
    shop = shop_db.query(Shop).filter(Shop.id == current_user.shop_id).first() if current_user.shop_id else None
    layout = (shop.layout or "retail") if shop else "retail"

    # Issue a fresh access token so the new name is reflected immediately
    new_token = create_access_token({
        "sub":         str(current_user.id),
        "staff_id":    str(current_user.id),
        "shop_id":     str(current_user.shop_id) if current_user.shop_id else None,
        "email":       current_user.email,
        "role":        current_user.role,
        "name":        current_user.name,
        "permissions": permissions,
        "layout":      layout,
    })

    return {
        "success": True,
        "access_token": new_token,
        "user": {
            "id":          str(current_user.id),
            "email":       current_user.email,
            "shop_id":     str(current_user.shop_id) if current_user.shop_id else None,
            "role":        current_user.role,
            "name":        current_user.name,
            "permissions": permissions,
        },
    }