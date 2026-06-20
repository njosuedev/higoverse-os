import random
import string
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_bearer import get_current_user
from app.core.security import verify_password, hash_password
from app.db.deps import get_db, get_shop_db
from app.models.password_reset import PasswordReset
from app.models.user import User
from app.schemas.auth import (
    RegisterShopRequest, LoginRequest, ChangePasswordRequest,
    ForgotPasswordRequest, ResetPasswordRequest,
)
from app.services.auth_service import register_shop, login_user
from app.utils.email import send_otp_email

router = APIRouter()


# ----------------------------
# REGISTER SHOP + OWNER
# ----------------------------
@router.post("/register")
def register(
    data: RegisterShopRequest,
    db: Session = Depends(get_db),
    shop_db: Session = Depends(get_shop_db),
):
    return register_shop(db, shop_db, data)


# ----------------------------
# LOGIN
# ----------------------------
@router.post("/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    return login_user(db, data.email, data.password)


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

    otp = "".join(random.choices(string.digits, k=6))
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    record = PasswordReset(email=payload.email, otp=otp, expires_at=expires_at)
    db.add(record)
    db.commit()

    try:
        send_otp_email(payload.email, otp)
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