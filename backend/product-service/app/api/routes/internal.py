from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.database import get_db
from app.models.product import Product

router = APIRouter(prefix="/internal", tags=["Internal"])


def require_internal_secret(x_internal_secret: str = Header(None)):
    if not settings.INTERNAL_SERVICE_SECRET or x_internal_secret != settings.INTERNAL_SERVICE_SECRET:
        raise HTTPException(status_code=403, detail="Invalid internal service secret")


# ── Shop status sync (called by auth-service) ─────────────────────────────
# Products and shops live in physically separate Postgres databases with no
# FK, so a live join isn't possible — auth-service calls this whenever a
# shop's is_active flag changes, keeping Product.shop_is_active in sync so
# marketplace queries can filter it server-side.
@router.patch("/shops/{shop_id}/status")
def update_shop_status(
    shop_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    _: None = Depends(require_internal_secret),
):
    is_active = payload.get("is_active")
    if not isinstance(is_active, bool):
        raise HTTPException(status_code=422, detail="is_active (bool) is required")

    updated = (
        db.query(Product)
        .filter(Product.shop_id == shop_id)
        .update({"shop_is_active": is_active}, synchronize_session=False)
    )
    db.commit()

    return {"success": True, "data": {"shop_id": shop_id, "updated": updated}}


# ── Stock adjustment (called by order-service) ────────────────────────────
# Customers placing an order have no shop_id, so the normal shop-scoped
# PUT /products/{id} route (which requires a shop-owner JWT) can't be used.
# order-service calls this with the shared internal secret instead, for both
# decrementing stock on order creation and restoring it on cancellation.
@router.post("/products/{product_id}/adjust-stock")
def adjust_stock(
    product_id: str,
    payload: dict,
    db: Session = Depends(get_db),
    _: None = Depends(require_internal_secret),
):
    delta = payload.get("delta")
    if not isinstance(delta, int):
        raise HTTPException(status_code=422, detail="delta (int) is required")

    updated = db.execute(
        text(
            "UPDATE products SET quantity = quantity + :delta "
            "WHERE id = :id AND quantity + :delta >= 0 "
            "RETURNING quantity"
        ),
        {"delta": delta, "id": product_id},
    ).fetchone()

    if not updated:
        raise HTTPException(status_code=400, detail="Insufficient stock or product not found")

    db.commit()
    return {"success": True, "data": {"quantity": updated[0]}}
