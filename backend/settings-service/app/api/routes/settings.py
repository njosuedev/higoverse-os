from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.settings import ShopSettings
from app.schemas.settings import SettingsUpdate
from app.core.security import get_current_user

router = APIRouter(prefix="/settings", tags=["Settings"])


def _fmt(s: ShopSettings) -> dict:
    return {
        "id": s.id,
        "shop_id": s.shop_id,
        "shop_name": s.shop_name,
        "phone": s.phone,
        "address": s.address,
        "currency": s.currency,
        "language": s.language,
        "low_stock_threshold": s.low_stock_threshold,
        "tax_rate": float(s.tax_rate) if s.tax_rate is not None else 0,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


def _get_or_create(db: Session, shop_id: str) -> ShopSettings:
    obj = db.query(ShopSettings).filter(ShopSettings.shop_id == shop_id).first()
    if not obj:
        obj = ShopSettings(shop_id=shop_id)
        db.add(obj)
        db.commit()
        db.refresh(obj)
    return obj


@router.get("/")
def get_settings(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    s = _get_or_create(db, user["shop_id"])
    return {"success": True, "data": _fmt(s)}


@router.put("/")
def update_settings(
    payload: SettingsUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    s = _get_or_create(db, user["shop_id"])

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(s, key, value)

    db.commit()
    db.refresh(s)
    return {"success": True, "message": "Settings saved", "data": _fmt(s)}
