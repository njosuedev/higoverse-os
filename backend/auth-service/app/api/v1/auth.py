import random
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_bearer import get_current_user
from app.core.config import settings
from app.core.permissions import default_permissions
from app.core.security import verify_password, hash_password, create_access_token
from app.db.deps import get_db, get_shop_db
from app.models.password_reset import PasswordReset
from app.models.user import User
from app.schemas.auth import (
    LoginRequest, RefreshRequest, LogoutRequest, ChangePasswordRequest,
    ForgotPasswordRequest, ResetPasswordRequest, UpdateProfileRequest,
)
from app.services.auth_service import login_user, refresh_tokens, logout_user
from app.utils.email import send_otp_email

router = APIRouter()

# ----------------------------
# LOGIN
# ----------------------------
@router.post("/login")
def login(data: LoginRequest, db: Session = Depends(get_db), shop_db: Session = Depends(get_shop_db)):
    return login_user(db, shop_db, data.email, data.password)

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
    user = db.query(User).filter(User.email == payload.email).first()
    # Always return success to avoid email enumeration
    if not user:
        return {"success": True, "message": "If that email is registered, an OTP has been sent."}

    # Invalidate any existing unused OTPs for this email
    db.query(PasswordReset).filter(
        PasswordReset.email == payload.email,
        PasswordReset.used == False,  # noqa: E712
    ).update({"used": True})

    otp = "".join(random.choices("0123456789", k=6))
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    record = PasswordReset(email=payload.email, otp=otp, expires_at=expires_at)
    db.add(record)
    db.commit()

    try:
        send_otp_email(payload.email, otp)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Email service is not configured. Please contact support.")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {exc}")

    return {"success": True, "message": "OTP sent to your email address."}

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
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.password_hash = hash_password(payload.new_password)
    record.used = True
    db.commit()

    return {"success": True, "message": "Password reset successfully. You can now sign in."}

# ----------------------------
# UPDATE PROFILE (authenticated)
# ----------------------------
@router.put("/profile")
def update_profile(
    payload: UpdateProfileRequest,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Name cannot be empty")

    current_user.name = name
    db.commit()

    permissions = current_user.permissions or default_permissions(current_user.role)

    # Issue a fresh access token so the new name is reflected immediately
    new_token = create_access_token({
        "sub":         str(current_user.id),
        "staff_id":    str(current_user.id),
        "shop_id":     str(current_user.shop_id) if current_user.shop_id else None,
        "email":       current_user.email,
        "role":        current_user.role,
        "name":        current_user.name,
        "permissions": permissions,
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