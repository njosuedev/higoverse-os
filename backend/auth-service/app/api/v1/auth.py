from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.schemas.auth import RegisterShopRequest, LoginRequest
from app.services.auth_service import register_shop, login_user

router = APIRouter()


# ----------------------------
# REGISTER SHOP + OWNER
# ----------------------------
@router.post("/register")
def register(data: RegisterShopRequest, db: Session = Depends(get_db)):
    return register_shop(db, data)


# ----------------------------
# LOGIN
# ----------------------------
@router.post("/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    return login_user(db, data.email, data.password)