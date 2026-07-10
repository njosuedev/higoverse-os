from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.order import Order
from app.schemas.order import OrderCreate, OrderStatusUpdate, VALID_STATUSES
from app.core.security import get_current_user
from app.core.product_client import get_marketplace_product, adjust_stock

router = APIRouter(prefix="/orders", tags=["Orders"])

# Legal forward transitions. cancelled is reachable from any state on the left
# except the two terminal ones (delivered, cancelled), handled separately below.
_TRANSITIONS = {
    "pending": {"confirmed", "cancelled"},
    "confirmed": {"out_for_delivery", "cancelled"},
    "out_for_delivery": {"delivered", "cancelled"},
    "delivered": set(),
    "cancelled": set(),
}


# ─────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────

def _fmt(o: Order) -> dict:
    return {
        "id": o.id,
        "customer_id": o.customer_id,
        "customer_name": o.customer_name,
        "customer_email": o.customer_email,
        "delivery_phone": o.delivery_phone,
        "shop_id": o.shop_id,
        "product_id": o.product_id,
        "product_name": o.product_name,
        "product_image": o.product_image,
        "quantity": o.quantity,
        "unit_price": float(o.unit_price),
        "total_amount": float(o.total_amount),
        "delivery_address_text": o.delivery_address_text,
        "delivery_lat": float(o.delivery_lat) if o.delivery_lat is not None else None,
        "delivery_lng": float(o.delivery_lng) if o.delivery_lng is not None else None,
        "delivery_notes": o.delivery_notes,
        "payment_method": o.payment_method,
        "status": o.status,
        "cancel_reason": o.cancel_reason,
        "created_at": o.created_at.isoformat() if o.created_at else None,
        "updated_at": o.updated_at.isoformat() if o.updated_at else None,
    }


def _require_admin(user: dict):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


def _get_or_404(db: Session, order_id: str) -> Order:
    o = db.query(Order).filter(Order.id == order_id).first()
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")
    return o


# ─────────────────────────────────────────
# CREATE ORDER (customer)
# ─────────────────────────────────────────

@router.post("/")
def create_order(
    payload: OrderCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    product = get_marketplace_product(payload.product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if not product.get("listed"):
        raise HTTPException(status_code=400, detail="Product is not available for order")
    if product["quantity"] < payload.quantity:
        raise HTTPException(status_code=400, detail=f"Insufficient stock. Available: {product['quantity']}")

    price = float(product["selling_price"])
    total = price * payload.quantity

    # Decrement stock BEFORE committing the order so a stock-update failure
    # doesn't leave an order with no corresponding inventory change.
    if not adjust_stock(payload.product_id, -payload.quantity):
        raise HTTPException(status_code=503, detail="Could not reserve stock. Order not placed.")

    order = Order(
        customer_id=user["user_id"],
        customer_name=payload.customer_name,
        customer_email=user.get("email"),
        delivery_phone=payload.delivery_phone,
        shop_id=product["shop_id"],
        product_id=payload.product_id,
        product_name=product.get("name"),
        product_image=(product.get("images") or "").split(",")[0] or None,
        quantity=payload.quantity,
        unit_price=price,
        total_amount=total,
        delivery_address_text=payload.delivery_address_text,
        delivery_lat=payload.delivery_lat,
        delivery_lng=payload.delivery_lng,
        delivery_notes=payload.delivery_notes,
        payment_method=payload.payment_method or "cash",
        status="pending",
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    return {"success": True, "message": "Order placed successfully", "data": _fmt(order)}


# ─────────────────────────────────────────
# MY ORDERS (customer)
# ─────────────────────────────────────────

@router.get("/mine")
def list_my_orders(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    page: int = 1,
    limit: int = 25,
):
    q = db.query(Order).filter(Order.customer_id == user["user_id"]).order_by(Order.created_at.desc())
    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()
    return {
        "success": True,
        "data": {"items": [_fmt(o) for o in items], "total": total, "page": page, "limit": limit},
    }


# ─────────────────────────────────────────
# SUMMARY (admin — status counts for dashboard tiles)
# ─────────────────────────────────────────

@router.get("/summary")
def get_summary(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    _require_admin(user)
    rows = db.query(Order.status, func.count(Order.id)).group_by(Order.status).all()
    counts = {status: 0 for status in VALID_STATUSES}
    for status, count in rows:
        counts[status] = int(count)
    return {"success": True, "data": counts}


# ─────────────────────────────────────────
# LIST ALL ORDERS (admin)
# ─────────────────────────────────────────

@router.get("/")
def list_orders(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    page: int = 1,
    limit: int = 25,
    status: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    search: str | None = None,
):
    _require_admin(user)
    q = db.query(Order)

    if status:
        q = q.filter(Order.status == status)
    if from_date:
        q = q.filter(Order.created_at >= datetime.fromisoformat(from_date + "T00:00:00"))
    if to_date:
        q = q.filter(Order.created_at <= datetime.fromisoformat(to_date + "T23:59:59"))
    if search:
        like = f"%{search}%"
        q = q.filter(
            (Order.customer_name.ilike(like))
            | (Order.delivery_phone.ilike(like))
            | (Order.product_name.ilike(like))
        )

    q = q.order_by(Order.created_at.desc())
    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()

    return {
        "success": True,
        "data": {"items": [_fmt(o) for o in items], "total": total, "page": page, "limit": limit},
    }


# ─────────────────────────────────────────
# GET SINGLE ORDER (owner or admin)
# ─────────────────────────────────────────

@router.get("/{order_id}")
def get_order(
    order_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    order = _get_or_404(db, order_id)
    if order.customer_id != user["user_id"] and user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Not authorized to view this order")
    return {"success": True, "data": _fmt(order)}


# ─────────────────────────────────────────
# UPDATE ORDER STATUS (admin)
# ─────────────────────────────────────────

@router.patch("/{order_id}/status")
def update_order_status(
    order_id: str,
    payload: OrderStatusUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    _require_admin(user)
    if payload.status not in VALID_STATUSES:
        raise HTTPException(status_code=422, detail=f"Invalid status. Must be one of: {sorted(VALID_STATUSES)}")

    order = _get_or_404(db, order_id)
    if payload.status not in _TRANSITIONS[order.status]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot move order from '{order.status}' to '{payload.status}'",
        )

    # Restore stock when cancelling an order that hadn't been delivered yet.
    if payload.status == "cancelled":
        adjust_stock(order.product_id, order.quantity)
        order.cancel_reason = payload.cancel_reason

    order.status = payload.status
    db.commit()
    db.refresh(order)

    return {"success": True, "message": "Order status updated", "data": _fmt(order)}
