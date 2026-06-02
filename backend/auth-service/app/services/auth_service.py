from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.shop import Shop
from app.models.user import User
from app.core.security import hash_password, verify_password, create_access_token


# ----------------------------
# REGISTER SHOP + OWNER USER
# ----------------------------
def register_shop(db: Session, data):

    # 1. CHECK IF SHOP EXISTS
    existing_shop = db.query(Shop).filter(Shop.email == data.email).first()
    if existing_shop:
        raise HTTPException(
            status_code=400,
            detail="Shop with this email already exists"
        )

    # 2. CHECK IF USER EXISTS
    existing_user = db.query(User).filter(User.email == data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="User with this email already exists"
        )

    # 3. CREATE SHOP
    shop = Shop(
        name=data.shop_name,
        email=data.email,
        phone=data.phone
    )

    db.add(shop)
    db.flush()  # get shop.id before commit

    # 4. CREATE OWNER USER
    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        shop_id=shop.id,
        role=data.role,
        role_id=None
    )

    db.add(user)

    db.commit()
    db.refresh(shop)

    # OPTIONAL: ensure user is also committed safely
    db.refresh(user)

    return {
        "message": "Shop created successfully",
        "shop_id": str(shop.id)
    }


# ----------------------------
# LOGIN USER
# ----------------------------
def login_user(db: Session, email: str, password: str):

    # 1. FIND USER
    user = db.query(User).filter(User.email == email).first()

    # 2. SAFE AUTH CHECK
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    # 3. CREATE JWT TOKEN
    token = create_access_token({
        "sub": str(user.id),
        "shop_id": str(user.shop_id),
        "email": user.email,
        "role": user.role
    })

    # 4. RESPONSE
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "shop_id": str(user.shop_id)
        }
    }