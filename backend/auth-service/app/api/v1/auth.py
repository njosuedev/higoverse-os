import random
import smtplib
import string
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_bearer import get_current_user
from app.core.config import settings
from app.core.security import verify_password, hash_password
from app.db.deps import get_db, get_shop_db
from app.models.password_reset import PasswordReset
from app.models.user import User
from app.core.security import create_access_token
from app.schemas.auth import (
    RegisterRequest, RegisterShopRequest, LoginRequest, ChangePasswordRequest,
    ForgotPasswordRequest, ResetPasswordRequest, VerifyRegistrationRequest,
    UpdateProfileRequest,
)
from app.services.auth_service import register_customer, register_shop, login_user


def _send_otp_email(to_email: str, otp: str) -> None:
    if not settings.SMTP_USER or not settings.SMTP_PASS:
        raise RuntimeError("SMTP credentials are not configured")

    html = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0"
       style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
<tr><td style="background:linear-gradient(135deg,#1d4ed8,#4f46e5);padding:32px;text-align:center">
  <div style="font-size:24px;font-weight:700;color:#fff;letter-spacing:1px">A & T Consultants</div>
  <div style="color:#bfdbfe;font-size:13px;margin-top:4px">Business Management Platform</div>
</td></tr>
<tr><td style="padding:36px 40px">
  <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">Password Reset Request</h2>
  <p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.6">
    Use the code below to reset your password — it expires in <strong>10 minutes</strong>.
  </p>
  <div style="background:#eff6ff;border:2px dashed #3b82f6;border-radius:12px;
              padding:24px;text-align:center;margin-bottom:24px">
    <div style="color:#64748b;font-size:12px;text-transform:uppercase;
                letter-spacing:2px;margin-bottom:8px">Your one-time code</div>
    <div style="font-size:42px;font-weight:800;letter-spacing:10px;
                color:#1d4ed8;font-family:'Courier New',monospace">{otp}</div>
  </div>
  <p style="margin:0;color:#94a3b8;font-size:12px">
    If you didn't request this, you can safely ignore this email.
  </p>
</td></tr>
<tr><td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0">
  <div style="color:#94a3b8;font-size:11px">&copy; {datetime.now(timezone.utc).year} A & T Consultants</div>
</td></tr>
</table></td></tr></table>
</body></html>"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Your A & T Consultants reset code: {otp}"
    msg["From"]    = settings.SMTP_FROM
    msg["To"]      = to_email
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASS)
        server.sendmail(settings.SMTP_USER, to_email, msg.as_string())

def _send_verification_email(to_email: str, otp: str) -> None:
    if not settings.SMTP_USER or not settings.SMTP_PASS:
        raise RuntimeError("SMTP credentials are not configured")

    html = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
<tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0"
       style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
<tr><td style="background:linear-gradient(135deg,#1d4ed8,#4f46e5);padding:32px;text-align:center">
  <div style="font-size:24px;font-weight:700;color:#fff;letter-spacing:1px">A & T Consultants</div>
  <div style="color:#bfdbfe;font-size:13px;margin-top:4px">Business Management Platform</div>
</td></tr>
<tr><td style="padding:36px 40px">
  <h2 style="margin:0 0 8px;font-size:20px;color:#0f172a">Verify your email address</h2>
  <p style="margin:0 0 24px;color:#64748b;font-size:14px;line-height:1.6">
    Welcome to A & T Consultants! Use the code below to verify your email — it expires in <strong>30 minutes</strong>.
  </p>
  <div style="background:#eff6ff;border:2px dashed #3b82f6;border-radius:12px;
              padding:24px;text-align:center;margin-bottom:24px">
    <div style="color:#64748b;font-size:12px;text-transform:uppercase;
                letter-spacing:2px;margin-bottom:8px">Your verification code</div>
    <div style="font-size:42px;font-weight:800;letter-spacing:10px;
                color:#1d4ed8;font-family:'Courier New',monospace">{otp}</div>
  </div>
  <p style="margin:0;color:#94a3b8;font-size:12px">
    If you didn't create an A & T Consultants account, you can safely ignore this email.
  </p>
</td></tr>
<tr><td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0">
  <div style="color:#94a3b8;font-size:11px">&copy; {datetime.now(timezone.utc).year} A & T Consultants</div>
</td></tr>
</table></td></tr></table>
</body></html>"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"Verify your A & T Consultants account: {otp}"
    msg["From"]    = settings.SMTP_FROM
    msg["To"]      = to_email
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
        server.ehlo()
        server.starttls()
        server.login(settings.SMTP_USER, settings.SMTP_PASS)
        server.sendmail(settings.SMTP_USER, to_email, msg.as_string())


router = APIRouter()


# ----------------------------
# REGISTER CUSTOMER
# ----------------------------
@router.post("/register")
def register(
    data: RegisterRequest,
    db: Session = Depends(get_db),
):
    register_customer(db, data)

    # Invalidate any previous unused OTPs for this email
    db.query(PasswordReset).filter(
        PasswordReset.email == data.email,
        PasswordReset.used == False,  # noqa: E712
    ).update({"used": True})

    otp = "".join(random.choices(string.digits, k=6))
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
    db.add(PasswordReset(email=data.email, otp=otp, expires_at=expires_at))
    db.commit()

    try:
        _send_verification_email(data.email, otp)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Email service is not configured. Please contact support.")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to send verification email: {exc}")

    return {"needs_verification": True, "email": data.email, "message": "Verification code sent to your email."}


# ----------------------------
# VERIFY REGISTRATION EMAIL
# ----------------------------
@router.post("/verify-registration")
def verify_registration(payload: VerifyRegistrationRequest, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    record = db.query(PasswordReset).filter(
        PasswordReset.email == payload.email,
        PasswordReset.otp == payload.otp,
        PasswordReset.used == False,  # noqa: E712
        PasswordReset.expires_at > now,
    ).first()

    if not record:
        raise HTTPException(status_code=400, detail="Invalid or expired code")

    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = True
    record.used = True
    db.commit()

    return {"success": True, "message": "Email verified. You can now sign in."}


# ----------------------------
# RESEND VERIFICATION CODE
# ----------------------------
@router.post("/resend-verification")
def resend_verification(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="No account found with this email")
    if user.is_active:
        raise HTTPException(status_code=400, detail="This email is already verified. Please sign in instead.")

    db.query(PasswordReset).filter(
        PasswordReset.email == payload.email,
        PasswordReset.used == False,  # noqa: E712
    ).update({"used": True})

    otp = "".join(random.choices(string.digits, k=6))
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
    db.add(PasswordReset(email=payload.email, otp=otp, expires_at=expires_at))
    db.commit()

    try:
        _send_verification_email(payload.email, otp)
    except RuntimeError:
        raise HTTPException(status_code=503, detail="Email service is not configured. Please contact support.")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {exc}")

    return {"success": True, "message": "New verification code sent."}


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
        _send_otp_email(payload.email, otp)
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

    # Issue a fresh token so the new name is reflected immediately
    new_token = create_access_token({
        "sub":     str(current_user.id),
        "shop_id": str(current_user.shop_id) if current_user.shop_id else None,
        "email":   current_user.email,
        "role":    current_user.role,
        "name":    current_user.name,
    })

    return {
        "success": True,
        "access_token": new_token,
        "user": {
            "id":      str(current_user.id),
            "email":   current_user.email,
            "shop_id": str(current_user.shop_id) if current_user.shop_id else None,
            "role":    current_user.role,
            "name":    current_user.name,
        },
    }