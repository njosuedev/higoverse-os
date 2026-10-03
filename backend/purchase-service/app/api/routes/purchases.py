from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.purchase import Purchase
from app.schemas.purchase import PurchaseCreate
from app.core.security import get_current_user
from app.core.product_client import get_product, restock_product, create_product

# The web app reaches this service through a Next.js rewrite, which can't
# send a trailing slash. Without the "" aliases FastAPI 307-redirects to
# "/purchases/" on this service's own origin, and browsers drop the
# Authorization header on that cross-origin redirect (→ 401, empty list).
router = APIRouter(prefix="/purchases", tags=["Purchases"])


# ─────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────

def _fmt(p: Purchase) -> dict:
    return {
        "id": p.id,
        "shop_id": p.shop_id,
        "product_id": p.product_id,
        "product_name": p.product_name,
        "supplier_id": p.supplier_id,
        "quantity_added": p.quantity_added,
        "cost_price": float(p.cost_price),
        "selling_price": float(p.selling_price) if p.selling_price else None,
        "total_cost": float(p.total_cost),
        "notes": p.notes,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _token(authorization: str | None) -> str:
    return authorization.replace("Bearer ", "") if authorization else ""


# ─────────────────────────────────────────
# LIST PURCHASES
# ─────────────────────────────────────────

@router.get("/")
@router.get("", include_in_schema=False)
def list_purchases(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    page: int = 1,
    limit: int = 25,
    from_date: str | None = None,
    to_date: str | None = None,
):
    q = db.query(Purchase).filter(Purchase.shop_id == user["shop_id"])

    if from_date:
        q = q.filter(Purchase.created_at >= datetime.fromisoformat(from_date + "T00:00:00"))
    if to_date:
        q = q.filter(Purchase.created_at <= datetime.fromisoformat(to_date + "T23:59:59"))

    q = q.order_by(Purchase.created_at.desc())
    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()

    return {
        "success": True,
        "data": {
            "items": [_fmt(p) for p in items],
            "total": total,
            "page": page,
            "limit": limit,
        },
    }


# ─────────────────────────────────────────
# SUMMARY (for report-service)
# ─────────────────────────────────────────

@router.get("/summary")
def get_summary(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    from_date: str | None = None,
    to_date: str | None = None,
):
    q = db.query(Purchase).filter(Purchase.shop_id == user["shop_id"])
    if from_date:
        q = q.filter(Purchase.created_at >= datetime.fromisoformat(from_date + "T00:00:00"))
    if to_date:
        q = q.filter(Purchase.created_at <= datetime.fromisoformat(to_date + "T23:59:59"))

    row = q.with_entities(
        func.coalesce(func.sum(Purchase.total_cost), 0).label("total_spent"),
        func.count(Purchase.id).label("purchases_count"),
    ).one()

    return {
        "success": True,
        "data": {
            "total_spent": float(row.total_spent),
            "purchases_count": int(row.purchases_count),
        },
    }


# ─────────────────────────────────────────
# RECORD PURCHASE
# ─────────────────────────────────────────

@router.post("/")
@router.post("", include_in_schema=False)
def record_purchase(
    payload: PurchaseCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    authorization: str = Header(None),
):
    if not user["shop_id"]:
        raise HTTPException(status_code=404, detail="No shop associated with this account")

    token = _token(authorization)

    if not payload.product_id and not payload.product_name:
        raise HTTPException(status_code=400, detail="Provide product_id (restock) or product_name (new item).")

    product_id = payload.product_id
    product_name = payload.product_name

    if payload.product_id:
        # ── Restock existing product ──────────────────────────────
        product = get_product(payload.product_id, token)
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        product_name = product["name"]
        ok = restock_product(payload.product_id, payload.quantity_added, product, token)
        if not ok:
            raise HTTPException(status_code=503, detail="Could not update stock in product-service. Purchase not recorded.")

    else:
        # ── Create new product ────────────────────────────────────
        created = create_product(
            name=payload.product_name,
            cost_price=float(payload.cost_price),
            selling_price=float(payload.selling_price) if payload.selling_price else float(payload.cost_price),
            quantity=payload.quantity_added,
            supplier_id=payload.supplier_id,
            description=payload.description,
            token=token,
        )
        if not created:
            raise HTTPException(status_code=500, detail="Failed to create product in product-service.")
        product_id = created.get("id")

    purchase = Purchase(
        shop_id=user["shop_id"],
        product_id=product_id,
        product_name=product_name,
        supplier_id=payload.supplier_id,
        quantity_added=payload.quantity_added,
        cost_price=payload.cost_price,
        selling_price=payload.selling_price,
        total_cost=float(payload.cost_price) * payload.quantity_added,
        notes=payload.notes,
    )
    db.add(purchase)
    db.commit()
    db.refresh(purchase)

    return {"success": True, "message": "Purchase recorded successfully", "data": _fmt(purchase)}


# ─────────────────────────────────────────
# DELETE PURCHASE
# ─────────────────────────────────────────

@router.delete("/{purchase_id}")
def delete_purchase(
    purchase_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    p = db.query(Purchase).filter(
        Purchase.id == purchase_id, Purchase.shop_id == user["shop_id"]
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Purchase not found")

    db.delete(p)
    db.commit()
    return {"success": True, "message": "Purchase record deleted"}
