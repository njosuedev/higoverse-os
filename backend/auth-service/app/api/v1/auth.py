from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_bearer import get_current_user
from app.core.security import verify_password, hash_password
from app.db.deps import get_db, get_shop_db
from app.schemas.auth import RegisterShopRequest, LoginRequest, ChangePasswordRequest
from app.services.auth_service import register_shop, login_user

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