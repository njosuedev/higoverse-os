from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.deps import get_db, get_shop_db
from app.schemas.auth import RegisterShopRequest, LoginRequest
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