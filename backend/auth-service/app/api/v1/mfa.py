"""Two-step sign-in for the platform admin (authenticator-app codes).

Off until the admin turns it on (setup, then enable with a first code).
From then on, sign-in with the right password answers {mfa_required,
mfa_ticket} instead of tokens, and /verify exchanges the ticket plus a code
(or a one-time recovery code) for the session.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core import mfa
from app.core.auth_bearer import get_current_user
from app.core.security import verify_password
from app.core.throttle import Throttle, too_many
from app.db.deps import get_db, get_shop_db
from app.models.admin_mfa import AdminMfa
from app.models.user import User
from app.services.auth_service import issue_tokens, revoke_all_sessions

logger = logging.getLogger("auth-service")
router = APIRouter()

# Wrong codes for one admin: 5 per 15 minutes, then wait (a 6-digit code
# can't be guessed at that rate).
mfa_failures = Throttle(limit=5, window=15 * 60)


class CodeIn(BaseModel):
    code: str = Field(..., min_length=6, max_length=20)


class VerifyIn(BaseModel):
    mfa_ticket: str = Field(..., max_length=2000)
    code: str = Field(..., min_length=6, max_length=20)


class DisableIn(BaseModel):
    password: str = Field(..., max_length=200)
    code: str = Field(..., min_length=6, max_length=20)


def _admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Two-step sign-in is for the platform admin.")
    return user


def _row(db: Session, user_id) -> AdminMfa | None:
    return db.query(AdminMfa).filter(AdminMfa.user_id == user_id).first()


def required_for(db: Session, user: User) -> bool:
    """Whether this user must give a code after the password."""
    if user.role != "admin":
        return False
    row = _row(db, user.id)
    return bool(row and row.enabled)


def _accept(db: Session, row: AdminMfa, code: str) -> bool:
    """Checks an authenticator code or a recovery code; records its use."""
    counter = mfa.check_code(row.secret, code, row.last_counter)
    if counter is not None:
        row.last_counter = counter
        db.commit()
        return True
    left = mfa.use_recovery_code(list(row.recovery or []), code)
    if left is not None:
        row.recovery = left
        db.commit()
        logger.warning("security: admin recovery code used user=%s left=%d", row.user_id, len(left))
        return True
    return False


@router.get("/status")
def status(db: Session = Depends(get_db), me: User = Depends(_admin)):
    row = _row(db, me.id)
    return {"success": True, "data": {
        "enabled": bool(row and row.enabled),
        "recovery_left": len(row.recovery or []) if row and row.enabled else 0,
    }}


@router.post("/setup")
def setup(db: Session = Depends(get_db), me: User = Depends(_admin)):
    """A new secret for the authenticator app (not active until /enable)."""
    row = _row(db, me.id)
    if row and row.enabled:
        raise HTTPException(status_code=409, detail="Two-step sign-in is already on. Turn it off first to change the app.")
    secret = mfa.new_secret()
    if row:
        row.secret, row.last_counter = secret, None
    else:
        db.add(AdminMfa(user_id=me.id, secret=secret, enabled=False, recovery=[]))
    db.commit()
    return {"success": True, "data": {"secret": secret, "otpauth_uri": mfa.otpauth_uri(secret, me.email)}}


@router.post("/enable")
def enable(payload: CodeIn, db: Session = Depends(get_db), shop_db: Session = Depends(get_shop_db), me: User = Depends(_admin)):
    """Turns it on once the app shows a working code. Returns the recovery
    codes (shown only now) and a new session: every other one is ended."""
    row = _row(db, me.id)
    if not row or row.enabled:
        raise HTTPException(status_code=409, detail="Start the setup first.")
    key = str(me.id)
    if mfa_failures.blocked(key):
        raise too_many()
    counter = mfa.check_code(row.secret, payload.code)
    if counter is None:
        mfa_failures.hit(key)
        raise HTTPException(status_code=400, detail="That code is not right. Check the time on your phone and try the newest code.")
    codes, hashes = mfa.new_recovery_codes()
    row.enabled, row.recovery, row.last_counter, row.enabled_at = True, hashes, counter, datetime.now(timezone.utc)
    db.commit()
    mfa_failures.clear(key)
    revoke_all_sessions(db, me.id)
    logger.warning("security: admin two-step sign-in enabled user=%s", me.id)
    return {"success": True, "data": {"recovery_codes": codes}, **issue_tokens(db, shop_db, me)}


@router.post("/disable")
def disable(payload: DisableIn, db: Session = Depends(get_db), me: User = Depends(_admin)):
    row = _row(db, me.id)
    if not row or not row.enabled:
        raise HTTPException(status_code=409, detail="Two-step sign-in is not on.")
    key = str(me.id)
    if mfa_failures.blocked(key):
        raise too_many()
    if not verify_password(payload.password, me.password_hash) or not _accept(db, row, payload.code):
        mfa_failures.hit(key)
        raise HTTPException(status_code=400, detail="Password or code is not right.")
    db.delete(row)
    db.commit()
    logger.warning("security: admin two-step sign-in disabled user=%s", me.id)
    return {"success": True}


@router.post("/verify")
def verify(payload: VerifyIn, db: Session = Depends(get_db), shop_db: Session = Depends(get_shop_db)):
    """Second step of sign-in: the ticket from /login plus a code."""
    user_id = mfa.read_ticket(payload.mfa_ticket)
    if not user_id:
        raise HTTPException(status_code=401, detail="Sign-in expired. Enter your password again.")
    if mfa_failures.blocked(user_id):
        raise too_many()
    user = db.query(User).filter(User.id == user_id).first()
    row = _row(db, user_id) if user else None
    if not user or not user.is_active or not row or not row.enabled:
        raise HTTPException(status_code=401, detail="Sign-in expired. Enter your password again.")
    if not _accept(db, row, payload.code):
        mfa_failures.hit(user_id)
        logger.warning("security: wrong admin sign-in code user=%s", user_id)
        raise HTTPException(status_code=400, detail="That code is not right.")
    mfa_failures.clear(user_id)
    return issue_tokens(db, shop_db, user)
