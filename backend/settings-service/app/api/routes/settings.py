import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.settings import ShopSettings
from app.schemas.settings import SettingsUpdate
from app.core.security import get_current_user

router = APIRouter(prefix="/settings", tags=["Settings"])

BANK_FIELDS = ("bank_name", "bank_account", "bank_holder")
BANK_EDITORS = {"owner", "admin"}


def _car_types(raw: str | None) -> list[str]:
    try:
        v = json.loads(raw) if raw else []
    except ValueError:
        return []
    return [x for x in v if isinstance(x, str)] if isinstance(v, list) else []


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
        "car_types": _car_types(s.car_types),
        "bank_name": s.bank_name or "",
        "bank_account": s.bank_account or "",
        "bank_holder": s.bank_holder or "",
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
@router.get("", include_in_schema=False)
def get_settings(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    if not user.get("shop_id"):
        raise HTTPException(status_code=404, detail="No shop associated with this account")
    s = _get_or_create(db, user["shop_id"])
    return {"success": True, "data": _fmt(s)}


@router.put("/")
@router.put("", include_in_schema=False)
def update_settings(
    payload: SettingsUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    if not user.get("shop_id"):
        raise HTTPException(status_code=404, detail="No shop associated with this account")
    s = _get_or_create(db, user["shop_id"])

    changes = payload.model_dump(exclude_unset=True)
    # Where customers send money: only the owner (or a platform admin) may change it.
    if any(k in changes and changes[k] != getattr(s, k) for k in BANK_FIELDS) and user.get("role") not in BANK_EDITORS:
        raise HTTPException(status_code=403, detail="Only the owner can change the bank account.")

    for key, value in changes.items():
        if key == "car_types":
            value = json.dumps(value) if value else None
        setattr(s, key, value)

    db.commit()
    db.refresh(s)
    return {"success": True, "message": "Settings saved", "data": _fmt(s)}
