from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.auth_bearer import get_current_user
from app.db.deps import get_db
from app.models.shop import Shop

router = APIRouter()


@router.get("/me")
def get_me(current_user=Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "shop_id": current_user.shop_id,
        "role": current_user.role,
    }


@router.get("/shops")
def list_shops(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    shops = db.query(Shop).filter(Shop.is_active == True).order_by(Shop.created_at.desc()).all()
    return {
        "success": True,
        "data": [
            {
                "id": str(s.id),
                "name": s.name,
                "email": s.email,
                "phone": s.phone,
                "is_active": s.is_active,
                "created_at": s.created_at.isoformat() if s.created_at else None,
            }
            for s in shops
        ],
    }