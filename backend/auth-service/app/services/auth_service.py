import uuid as _uuid

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.shop import Shop
from app.models.user import User
from app.core.security import hash_password, verify_password, create_access_token


# ----------------------------
# REGISTER SHOP + OWNER USER
# ----------------------------
def register_shop(db: Session, shop_db: Session, data):

    # 1. CHECK IF SHOP EXISTS (in shop_db)
    existing_shop = shop_db.query(Shop).filter(Shop.email == data.email).first()
    if existing_shop:
        raise HTTPException(
            status_code=400,
            detail="Shop with this email already exists"
        )

    # 2. CHECK IF USER EXISTS (in auth_db)
    existing_user = db.query(User).filter(User.email == data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="User with this email already exists"
        )

    # 3. Pre-generate a shared UUID so both DBs reference the same shop id
    shop_id = _uuid.uuid4()

    # 4. CREATE SHOP in shop_db (primary store for shop data)
    shop_in_shopdb = Shop(
        id=shop_id,
        name=data.shop_name,
        email=data.email,
        phone=data.phone,
        address=data.address,
        description=data.description,
    )
    shop_db.add(shop_in_shopdb)

    # 5. MIRROR SHOP in auth_db so the users.shop_id FK constraint is satisfied
    shop_in_authdb = Shop(
        id=shop_id,
        name=data.shop_name,
        email=data.email,
        phone=data.phone,
        address=data.address,
        description=data.description,
    )
    db.add(shop_in_authdb)

    # 6. CREATE OWNER USER in auth_db (inactive until email is verified)
    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        shop_id=shop_id,
        role=data.role,
        role_id=None,
        is_active=False,
    )
    db.add(user)

    shop_db.commit()
    db.commit()

    return {
        "message": "Shop created successfully",
        "shop_id": str(shop_id)
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

    if not user.is_active:
        raise HTTPException(
            status_code=403,
            detail="Email not verified. Please enter the code sent to your inbox."
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
            "shop_id": str(user.shop_id),
            "role": user.role,
        }
    }