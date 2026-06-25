import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_bearer import get_current_user
from app.db.deps import get_db, get_shop_db
from app.models.shop import Shop
from app.schemas.shop import ShopUpdate

router = APIRouter()


def _fmt(s: Shop) -> dict:
    return {
        "id":           str(s.id),
        "name":         s.name,
        "email":        s.email,
        "phone":        s.phone,
        "address":      s.address,
        "description":  s.description,
        "logo_url":     s.logo_url,
        "is_active":    s.is_active,
        "created_at":   s.created_at.isoformat() if s.created_at else None,
        "updated_at":   s.updated_at.isoformat() if s.updated_at else None,
        "last_seen_at": s.last_seen_at.isoformat() if s.last_seen_at else None,
    }


# ── Current user identity ─────────────────────────────────
@router.get("/me")
def get_me(current_user=Depends(get_current_user)):
    return {
        "id":      str(current_user.id),
        "name":    current_user.name,
        "email":   current_user.email,
        "shop_id": str(current_user.shop_id) if current_user.shop_id else None,
        "role":    current_user.role,
    }


# ── My shop profile ───────────────────────────────────────
@router.get("/shop")
def get_my_shop(
    db: Session = Depends(get_shop_db),
    current_user=Depends(get_current_user),
):
    shop = db.query(Shop).filter(Shop.id == current_user.shop_id).first()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    return {"success": True, "data": _fmt(shop)}


@router.put("/shop")
def update_my_shop(
    payload: ShopUpdate,
    db: Session = Depends(get_shop_db),
    current_user=Depends(get_current_user),
):
    shop = db.query(Shop).filter(Shop.id == current_user.shop_id).first()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(shop, field, value)

    shop.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(shop)
    return {"success": True, "message": "Shop updated", "data": _fmt(shop)}


# ── Heartbeat — keeps last_seen_at fresh while user is logged in ──
@router.patch("/shop/heartbeat")
def shop_heartbeat(
    db: Session = Depends(get_shop_db),
    current_user=Depends(get_current_user),
):
    shop = db.query(Shop).filter(Shop.id == current_user.shop_id).first()
    if shop:
        shop.last_seen_at = datetime.now(timezone.utc)
        db.commit()
    return {"success": True}


# ── All shops (directory) ─────────────────────────────────
@router.get("/shops")
def list_shops(
    db: Session = Depends(get_shop_db),
    current_user=Depends(get_current_user),
):
    shops = db.query(Shop).filter(Shop.is_active == True).order_by(Shop.created_at.desc()).all()
    return {"success": True, "data": [_fmt(s) for s in shops]}


# ── Shop application (customer → create or resubmit) ─────
@router.post("/shop-application")
def submit_shop_application(
    payload: ShopUpdate,
    auth_db: Session = Depends(get_db),
    shop_db: Session = Depends(get_shop_db),
    current_user=Depends(get_current_user),
):
    """
    Customer submits a new shop application (or resubmits after rejection).
    - First submission: creates an inactive shop in both DBs and links it to the user.
    - Resubmission: updates the existing inactive shop.
    """
    if current_user.role not in ("customer", "owner"):
        raise HTTPException(status_code=403, detail="Not allowed")

    now = datetime.now(timezone.utc)

    if current_user.shop_id:
        # Resubmission — update the existing (inactive) shop
        shop = shop_db.query(Shop).filter(Shop.id == current_user.shop_id).first()
        if not shop:
            raise HTTPException(status_code=404, detail="Shop not found")
        if shop.is_active:
            raise HTTPException(status_code=400, detail="Your shop is already active")

        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(shop, field, value)
        shop.updated_at = now
        shop_db.commit()

        # Mirror update in auth_db
        auth_shop = auth_db.query(Shop).filter(Shop.id == current_user.shop_id).first()
        if auth_shop:
            for field, value in payload.model_dump(exclude_unset=True).items():
                setattr(auth_shop, field, value)
            auth_shop.updated_at = now
            auth_db.commit()

        shop_db.refresh(shop)
        return {"success": True, "message": "Application updated", "data": _fmt(shop)}

    # First submission — create inactive shop in both DBs
    if not payload.name:
        raise HTTPException(status_code=422, detail="Shop name is required")

    shop_id = uuid.uuid4()

    shop_in_shopdb = Shop(
        id=shop_id,
        name=payload.name,
        email=current_user.email,
        phone=payload.phone,
        address=payload.address,
        description=payload.description,
        logo_url=payload.logo_url,
        is_active=False,
    )
    shop_db.add(shop_in_shopdb)

    shop_in_authdb = Shop(
        id=shop_id,
        name=payload.name,
        email=current_user.email,
        phone=payload.phone,
        address=payload.address,
        description=payload.description,
        logo_url=payload.logo_url,
        is_active=False,
    )
    auth_db.add(shop_in_authdb)

    # Link shop to user
    current_user.shop_id = shop_id

    shop_db.commit()
    auth_db.commit()
    shop_db.refresh(shop_in_shopdb)

    return {"success": True, "message": "Application submitted", "data": _fmt(shop_in_shopdb)}