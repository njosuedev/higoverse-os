from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.shop import Shop
from app.schemas.shop import ShopUpdate, ShopAdminUpdate


def _fmt(s: Shop) -> dict:
    return {
        "id":          str(s.id),
        "name":        s.name,
        "email":       s.email,
        "phone":       s.phone,
        "address":     s.address,
        "description": s.description,
        "is_active":   s.is_active,
        "created_at":  s.created_at.isoformat() if s.created_at else None,
        "updated_at":  s.updated_at.isoformat() if s.updated_at else None,
    }


def get_shop_or_404(db: Session, shop_id: str) -> Shop:
    shop = db.query(Shop).filter(Shop.id == shop_id).first()
    if not shop:
        raise HTTPException(status_code=404, detail="Shop not found")
    return shop


def list_shops(
    db: Session,
    search: Optional[str] = None,
    active_only: bool = True,
    page: int = 1,
    limit: int = 20,
) -> dict:
    query = db.query(Shop)
    if active_only:
        query = query.filter(Shop.is_active == True)
    if search:
        like = f"%{search.lower()}%"
        query = query.filter(
            Shop.name.ilike(like) | Shop.email.ilike(like) | Shop.address.ilike(like)
        )
    total = query.count()
    shops = query.order_by(Shop.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    return {
        "total": total,
        "page":  page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
        "items": [_fmt(s) for s in shops],
    }


def get_my_shop(db: Session, shop_id: str) -> dict:
    shop = get_shop_or_404(db, shop_id)
    return _fmt(shop)


def update_my_shop(db: Session, shop_id: str, payload: ShopUpdate) -> dict:
    shop = get_shop_or_404(db, shop_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(shop, field, value)
    shop.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(shop)
    return _fmt(shop)


def admin_update_shop(db: Session, shop_id: str, payload: ShopAdminUpdate) -> dict:
    shop = get_shop_or_404(db, shop_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(shop, field, value)
    shop.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(shop)
    return _fmt(shop)


def toggle_shop_status(db: Session, shop_id: str) -> dict:
    shop = get_shop_or_404(db, shop_id)
    shop.is_active = not shop.is_active
    shop.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(shop)
    return _fmt(shop)
