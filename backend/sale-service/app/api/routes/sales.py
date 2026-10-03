from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.sale import Sale
from app.schemas.sale import SaleCreate, SaleUpdate
from app.core.security import get_current_user, hides_financials
from app.core.product_client import get_product, update_product_stock

router = APIRouter(prefix="/sales", tags=["Sales"])


# Money fields a car company's staff must not see (see hides_financials).
# Each sale's own total stays visible — staff record and print sales.
_FINANCIAL_KEYS = {"profit", "cost_at_sale", "revenue"}


def _scrub(user: dict, value):
    """Blank out financial fields for users who may not see them."""
    if not hides_financials(user):
        return value
    if isinstance(value, dict):
        return {k: (None if k in _FINANCIAL_KEYS else _scrub(user, v)) for k, v in value.items()}
    if isinstance(value, list):
        return [_scrub(user, v) for v in value]
    return value


# ─────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────

def _get_or_404(db: Session, sale_id: str, shop_id: str) -> Sale:
    s = db.query(Sale).filter(Sale.id == sale_id, Sale.shop_id == shop_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Sale not found")
    return s


def _fmt(s: Sale) -> dict:
    return {
        "id": s.id,
        "shop_id": s.shop_id,
        "product_id": s.product_id,
        "product_name": s.product_name,
        "customer_id": s.customer_id,
        "quantity": s.quantity,
        "unit_price": float(s.unit_price),
        "cost_at_sale": float(s.cost_at_sale) if s.cost_at_sale is not None else None,
        "total_amount": float(s.total_amount),
        "profit": float(s.profit) if s.profit is not None else None,
        "notes": s.notes,
        "payment_method": s.payment_method,
        "amount_paid": float(s.amount_paid) if s.amount_paid is not None else None,
        "created_at": s.created_at.isoformat() if s.created_at else None,
    }


def _token(authorization: str | None) -> str:
    return authorization.replace("Bearer ", "") if authorization else ""


# ─────────────────────────────────────────
# LIST SALES
# ─────────────────────────────────────────

@router.get("/")
@router.get("", include_in_schema=False)
def list_sales(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    page: int = 1,
    limit: int = 25,
    from_date: str | None = None,
    to_date: str | None = None,
    product_id: str | None = None,  # e.g. who bought this car (latest first)
):
    if not user["shop_id"]:
        return _scrub(user, {"success": True, "data": {"items": [], "total": 0, "page": page, "limit": limit}})

    q = db.query(Sale).filter(Sale.shop_id == user["shop_id"])
    if product_id:
        q = q.filter(Sale.product_id == product_id)

    if from_date:
        q = q.filter(Sale.created_at >= datetime.fromisoformat(from_date + "T00:00:00"))
    if to_date:
        q = q.filter(Sale.created_at <= datetime.fromisoformat(to_date + "T23:59:59"))

    q = q.order_by(Sale.created_at.desc())
    total = q.count()
    items = q.offset((page - 1) * limit).limit(limit).all()

    return _scrub(user, {
        "success": True,
        "data": {
            "items": [_fmt(s) for s in items],
            "total": total,
            "page": page,
            "limit": limit,
        },
    })


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
    if not user["shop_id"]:
        return _scrub(user, {
            "success": True,
            "data": {
                "revenue": 0.0, "profit": 0.0, "items_sold": 0,
                "sales_count": 0, "unique_customers": 0,
            },
        })

    q = db.query(Sale).filter(Sale.shop_id == user["shop_id"])
    if from_date:
        q = q.filter(Sale.created_at >= datetime.fromisoformat(from_date + "T00:00:00"))
    if to_date:
        q = q.filter(Sale.created_at <= datetime.fromisoformat(to_date + "T23:59:59"))

    row = q.with_entities(
        func.coalesce(func.sum(Sale.total_amount), 0).label("revenue"),
        func.coalesce(func.sum(Sale.profit), 0).label("profit"),
        func.coalesce(func.sum(Sale.quantity), 0).label("items_sold"),
        func.count(Sale.id).label("sales_count"),
        func.count(func.distinct(Sale.customer_id)).label("unique_customers"),
    ).one()

    return _scrub(user, {
        "success": True,
        "data": {
            "revenue": float(row.revenue),
            "profit": float(row.profit),
            "items_sold": int(row.items_sold),
            "sales_count": int(row.sales_count),
            "unique_customers": int(row.unique_customers),
        },
    })


# ─────────────────────────────────────────
# DAILY BREAKDOWN (for report-service)
# ─────────────────────────────────────────

@router.get("/daily")
def get_daily(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    days: int = 14,
):
    if not user["shop_id"]:
        return _scrub(user, {"success": True, "data": []})

    since = datetime.now(timezone.utc) - timedelta(days=days)
    q = db.query(Sale).filter(
        Sale.shop_id == user["shop_id"],
        Sale.created_at >= since,
    )

    rows = q.with_entities(
        func.date(Sale.created_at).label("day"),
        func.coalesce(func.sum(Sale.total_amount), 0).label("revenue"),
        func.coalesce(func.sum(Sale.profit), 0).label("profit"),
        func.count(Sale.id).label("sales_count"),
    ).group_by(func.date(Sale.created_at)).order_by(func.date(Sale.created_at)).all()

    return _scrub(user, {
        "success": True,
        "data": [
            {
                "day": str(r.day),
                "revenue": float(r.revenue),
                "profit": float(r.profit),
                "sales_count": int(r.sales_count),
            }
            for r in rows
        ],
    })


# ─────────────────────────────────────────
# TOP PRODUCTS (for report-service)
# ─────────────────────────────────────────

@router.get("/top-products")
def get_top_products(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    limit: int = 10,
    from_date: str | None = None,
    to_date: str | None = None,
):
    if not user["shop_id"]:
        return _scrub(user, {"success": True, "data": []})

    q = db.query(Sale).filter(Sale.shop_id == user["shop_id"])
    if from_date:
        q = q.filter(Sale.created_at >= datetime.fromisoformat(from_date + "T00:00:00"))
    if to_date:
        q = q.filter(Sale.created_at <= datetime.fromisoformat(to_date + "T23:59:59"))

    rows = q.with_entities(
        Sale.product_id,
        Sale.product_name,
        func.sum(Sale.quantity).label("qty_sold"),
        func.sum(Sale.total_amount).label("revenue"),
        func.sum(Sale.profit).label("profit"),
    ).group_by(Sale.product_id, Sale.product_name).order_by(
        func.sum(Sale.total_amount).desc()
    ).limit(limit).all()

    return _scrub(user, {
        "success": True,
        "data": [
            {
                "product_id": r.product_id,
                "product_name": r.product_name,
                "qty_sold": int(r.qty_sold),
                "revenue": float(r.revenue),
                "profit": float(r.profit) if r.profit else 0.0,
            }
            for r in rows
        ],
    })


# ─────────────────────────────────────────
# CREATE SALE
# ─────────────────────────────────────────

@router.post("/")
@router.post("", include_in_schema=False)
def create_sale(
    payload: SaleCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    authorization: str = Header(None),
):
    if not user["shop_id"]:
        raise HTTPException(status_code=400, detail="You need a shop before recording sales")
    # Car companies sell every vehicle to a named customer (the app collects
    # their full name, phone, ID and address before this call).
    if user.get("layout") == "car" and not (payload.customer_id or "").strip():
        raise HTTPException(status_code=400, detail="Choose the customer buying this car.")

    token = _token(authorization)
    product = get_product(payload.product_id, token)

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product["quantity"] < payload.quantity:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient stock. Available: {product['quantity']}",
        )

    cost = float(product.get("cost_price", 0))
    price = float(payload.unit_price)
    total = price * payload.quantity
    profit = (price - cost) * payload.quantity

    # Reduce stock BEFORE committing the sale so a stock-update failure
    # doesn't leave a sale with no corresponding inventory change.
    new_qty = product["quantity"] - payload.quantity
    stock_ok = update_product_stock(payload.product_id, new_qty, product, token)
    if not stock_ok:
        raise HTTPException(
            status_code=503,
            detail="Could not update product stock. Sale not recorded.",
        )

    sale = Sale(
        shop_id=user["shop_id"],
        product_id=payload.product_id,
        product_name=product.get("name"),
        customer_id=payload.customer_id,
        quantity=payload.quantity,
        unit_price=payload.unit_price,
        cost_at_sale=cost,
        total_amount=total,
        profit=profit,
        notes=payload.notes,
        payment_method=payload.payment_method,
        amount_paid=float(payload.amount_paid) if payload.amount_paid is not None else None,
    )
    db.add(sale)
    db.commit()
    db.refresh(sale)

    return _scrub(user, {"success": True, "message": "Sale recorded successfully", "data": _fmt(sale)})


# ─────────────────────────────────────────
# GET SINGLE SALE
# ─────────────────────────────────────────

@router.get("/{sale_id}")
def get_sale(
    sale_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    return _scrub(user, {"success": True, "data": _fmt(_get_or_404(db, sale_id, user["shop_id"]))})


# ─────────────────────────────────────────
# UPDATE SALE
# ─────────────────────────────────────────

@router.put("/{sale_id}")
def update_sale(
    sale_id: str,
    payload: SaleUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    authorization: str = Header(None),
):
    token = _token(authorization)
    sale = _get_or_404(db, sale_id, user["shop_id"])

    old_product_id = sale.product_id
    old_qty = sale.quantity

    update_data = payload.model_dump(exclude_unset=True)
    new_product_id = update_data.get("product_id", old_product_id)
    new_qty = update_data.get("quantity", old_qty)
    new_price = float(update_data.get("unit_price", sale.unit_price))

    product = get_product(new_product_id, token)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    available = product["quantity"] + (old_qty if new_product_id == old_product_id else 0)
    if new_qty > available:
        raise HTTPException(status_code=400, detail=f"Insufficient stock. Available: {available}")

    cost = float(product.get("cost_price", 0))

    for key, value in update_data.items():
        setattr(sale, key, value)

    if "product_id" in update_data:
        sale.product_name = product.get("name")

    sale.cost_at_sale = cost
    sale.total_amount = new_price * new_qty
    sale.profit = (new_price - cost) * new_qty
    db.commit()
    db.refresh(sale)

    if old_product_id == new_product_id:
        update_product_stock(new_product_id, product["quantity"] + old_qty - new_qty, product, token)
    else:
        old_product = get_product(old_product_id, token)
        if old_product:
            update_product_stock(old_product_id, old_product["quantity"] + old_qty, old_product, token)
        update_product_stock(new_product_id, product["quantity"] - new_qty, product, token)

    return _scrub(user, {"success": True, "message": "Sale updated", "data": _fmt(sale)})


# ─────────────────────────────────────────
# DELETE SALE
# ─────────────────────────────────────────

@router.delete("/{sale_id}")
def delete_sale(
    sale_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    authorization: str = Header(None),
):
    token = _token(authorization)
    sale = _get_or_404(db, sale_id, user["shop_id"])

    product = get_product(sale.product_id, token)
    if product:
        update_product_stock(sale.product_id, product["quantity"] + sale.quantity, product, token)

    db.delete(sale)
    db.commit()
    return {"success": True, "message": "Sale deleted"}
