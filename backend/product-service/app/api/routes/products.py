import base64
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Header
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy import func, tuple_
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.product import Product
from app.schemas.product import ProductCreate, ProductUpdate
from app.core.security import get_current_user, get_current_user_optional
from app.core.supplier_client import validate_supplier

router = APIRouter(prefix="/products", tags=["Products"])


# -----------------------------
# MARKETPLACE FEED CURSOR (keyset pagination)
# -----------------------------
def encode_marketplace_cursor(created_at: datetime, product_id: str) -> str:
    raw = f"{created_at.isoformat()}|{product_id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def decode_marketplace_cursor(cursor: str) -> tuple[datetime, str] | None:
    """Returns None on any malformed/stale cursor so callers can gracefully
    fall back to first-page behavior instead of erroring."""
    try:
        raw = base64.urlsafe_b64decode(cursor.encode()).decode()
        created_at_raw, product_id = raw.split("|", 1)
        return datetime.fromisoformat(created_at_raw), product_id
    except Exception:
        return None


# -----------------------------
# HELPERS
# -----------------------------
def get_product_or_404(db: Session, product_id: str, shop_id: str):
    product = (
        db.query(Product)
        .filter(
            Product.id == product_id,
            Product.shop_id == shop_id
        )
        .first()
    )

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    return product


def calculate_profit(cost_price: float, selling_price: float):
    if cost_price == 0:
        return 0, 0

    profit = selling_price - cost_price
    percent = (profit / cost_price) * 100

    return profit, round(percent, 2)


# -----------------------------
# SUMMARY (for report-service)
# -----------------------------
@router.get("/summary")
def get_summary(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    row = db.query(Product).filter(Product.shop_id == user["shop_id"]).with_entities(
        func.coalesce(func.sum(Product.selling_price * Product.quantity), 0).label("stock_value"),
        func.coalesce(func.sum((Product.selling_price - Product.cost_price) * Product.quantity), 0).label("potential_profit"),
        func.count(Product.id).label("total_products"),
        func.sum(func.case((Product.quantity == 0, 1), else_=0)).label("out_of_stock"),
        func.sum(func.case(((Product.quantity > 0) & (Product.quantity <= 10), 1), else_=0)).label("low_stock"),
    ).one()

    return {
        "success": True,
        "data": {
            "stock_value": float(row.stock_value),
            "potential_profit": float(row.potential_profit),
            "total_products": int(row.total_products),
            "out_of_stock": int(row.out_of_stock),
            "low_stock": int(row.low_stock),
        },
    }


# -----------------------------
# STOCK ALERTS (for report-service)
# -----------------------------
@router.get("/stock-alerts")
def get_stock_alerts(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    threshold: int = 10,
):
    items = db.query(Product).filter(
        Product.shop_id == user["shop_id"],
        Product.quantity <= threshold,
    ).order_by(Product.quantity.asc()).all()

    return {
        "success": True,
        "data": [
            {
                "id": p.id,
                "name": p.name,
                "quantity": p.quantity,
                "cost_price": float(p.cost_price),
                "selling_price": float(p.selling_price),
                "supplier_id": p.supplier_id,
            }
            for p in items
        ],
    }


# -----------------------------
# GET ALL PRODUCTS
# -----------------------------
@router.get("/")
def get_products(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    page: int = 1,
    limit: int = 10
):
    offset = (page - 1) * limit

    query = db.query(Product).filter(Product.shop_id == user["shop_id"])

    total = query.count()
    products = query.offset(offset).limit(limit).all()

    items = []

    for p in products:
        profit, percent = calculate_profit(p.cost_price, p.selling_price)

        items.append({
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "supplier_id": p.supplier_id,
            "cost_price": float(p.cost_price),
            "selling_price": float(p.selling_price),
            "quantity": p.quantity,
            "category": p.category,
            "images": p.images,
            "listed": p.listed,
            "profit_status": "profit" if profit >= 0 else "loss",
            "profit_money": float(profit),
            "profit_percent": percent
        })

    return {
        "success": True,
        "data": {
            "items": items,
            "total": total,
            "page": page,
            "limit": limit
        }
    }


# -----------------------------
# CREATE PRODUCT
# -----------------------------
@router.post("/")
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    authorization: str = Header(None)
):
    try:
        validate_supplier(
            payload.supplier_id,
            user["shop_id"],
            (authorization or "").replace("Bearer ", "")
        )

        selling_price = payload.selling_price or payload.cost_price

        product = Product(
            shop_id=user["shop_id"],
            supplier_id=payload.supplier_id,
            name=payload.name,
            description=payload.description,
            cost_price=payload.cost_price,
            selling_price=selling_price,
            quantity=payload.quantity,
            barcode=payload.barcode,
            category=payload.category,
            images=payload.images,
            listed=payload.listed,
        )

        db.add(product)
        db.commit()
        db.refresh(product)

        profit, percent = calculate_profit(
            product.cost_price,
            product.selling_price
        )

        return {
            "success": True,
            "message": "Product created successfully",
            "data": {
                "id": product.id,
                "name": product.name,
                "supplier_id": product.supplier_id,
                "cost_price": float(product.cost_price),
                "selling_price": float(product.selling_price),
                "profit_money": float(profit),
                "profit_percent": percent
            }
        }

    except StarletteHTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# -----------------------------
# GET MARKETPLACE (cross-shop, all listed products)
# Public — no login required, so guests can browse the marketplace.
# Must be registered BEFORE /{product_id} to avoid "marketplace" matching as an ID
# -----------------------------
@router.get("/marketplace")
def get_marketplace(
    db: Session = Depends(get_db),
    user: dict | None = Depends(get_current_user_optional),
    page: int = 1,
    limit: int = 100,
    cursor: str | None = None,
    category: str | None = None,
):
    query = db.query(Product).filter(Product.listed == True)  # noqa: E712
    if category:
        query = query.filter(Product.category == category)

    cursor_value = decode_marketplace_cursor(cursor) if cursor else None

    if cursor_value is not None:
        # Keyset pagination — stays fast at any depth, unlike OFFSET.
        cursor_created_at, cursor_id = cursor_value
        query = query.filter(
            tuple_(Product.created_at, Product.id) < (cursor_created_at, cursor_id)
        )
        products = query.order_by(Product.created_at.desc(), Product.id.desc()).limit(limit).all()
        total = None  # only computed on the first, cursor-less request
        response_page = None
    else:
        # First request of a session (or a legacy page/limit caller) — count once.
        offset = (page - 1) * limit
        total = query.count()
        products = query.order_by(Product.created_at.desc(), Product.id.desc()).offset(offset).limit(limit).all()
        response_page = page

    items = []
    for p in products:
        items.append({
            "id": p.id,
            "shop_id": p.shop_id,
            "name": p.name,
            "description": p.description,
            "category": p.category,
            "images": p.images,
            "selling_price": float(p.selling_price),
            # cost_price is intentionally omitted — this endpoint is public,
            # and cost_price is a shop's private profit margin.
            "quantity": p.quantity,
            "listed": p.listed,
            "created_at": p.created_at.isoformat(),
        })

    next_cursor = None
    if len(products) == limit:
        last = products[-1]
        next_cursor = encode_marketplace_cursor(last.created_at, last.id)

    return {
        "success": True,
        "data": {
            "items": items,
            "total": total,
            "page": response_page,
            "limit": limit,
            "next_cursor": next_cursor,
        }
    }


# -----------------------------
# GET ONE MARKETPLACE PRODUCT BY SLUG-EMBEDDED ID PREFIX
# Public — lets the product detail page fetch exactly one listed product
# instead of the whole feed. Product slugs are "{name}-{id[:6]}" (see
# apps/web/lib/slug.ts), so `id_prefix` is that 6-char suffix (or a full id).
# Must be registered BEFORE /{product_id} — same reasoning as /marketplace.
# -----------------------------
@router.get("/marketplace/by-id/{id_prefix}")
def get_marketplace_product_by_id_prefix(
    id_prefix: str,
    db: Session = Depends(get_db),
    user: dict | None = Depends(get_current_user_optional),
):
    # Escape LIKE wildcards — id_prefix is attacker-controlled (public route param).
    escaped_prefix = id_prefix.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    product = (
        db.query(Product)
        .filter(Product.listed == True, Product.id.like(f"{escaped_prefix}%", escape="\\"))  # noqa: E712
        .first()
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    return {
        "success": True,
        "data": {
            "id": product.id,
            "shop_id": product.shop_id,
            "name": product.name,
            "description": product.description,
            "category": product.category,
            "images": product.images,
            "selling_price": float(product.selling_price),
            "quantity": product.quantity,
            "listed": product.listed,
            "created_at": product.created_at.isoformat(),
        },
    }


# -----------------------------
# GET SINGLE PRODUCT
# -----------------------------
@router.get("/{product_id}")
def get_product(
    product_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    product = get_product_or_404(db, product_id, user["shop_id"])

    profit, percent = calculate_profit(
        product.cost_price,
        product.selling_price
    )

    return {
        "success": True,
        "data": {
            "id": product.id,
            "name": product.name,
            "supplier_id": product.supplier_id,
            "description": product.description,
            "category": product.category,
            "images": product.images,
            "listed": product.listed,
            "cost_price": float(product.cost_price),
            "selling_price": float(product.selling_price),
            "quantity": product.quantity,
            "profit_money": float(profit),
            "profit_percent": percent
        }
    }


# -----------------------------
# UPDATE PRODUCT
# -----------------------------
@router.put("/{product_id}")
def update_product(
    product_id: str,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    authorization: str = Header(None)
):
    try:
        product = get_product_or_404(db, product_id, user["shop_id"])

        update_data = payload.model_dump(exclude_unset=True)

        if "supplier_id" in update_data:
            validate_supplier(
                update_data["supplier_id"],
                user["shop_id"],
                (authorization or "").replace("Bearer ", "")
            )

        for key, value in update_data.items():
            setattr(product, key, value)

        if product.selling_price is None:
            product.selling_price = product.cost_price

        db.commit()
        db.refresh(product)

        profit, percent = calculate_profit(
            product.cost_price,
            product.selling_price
        )

        return {
            "success": True,
            "message": "Product updated successfully",
            "data": {
                "id": product.id,
                "name": product.name,
                "supplier_id": product.supplier_id,
                "cost_price": float(product.cost_price),
                "selling_price": float(product.selling_price),
                "profit_money": float(profit),
                "profit_percent": percent
            }
        }

    except StarletteHTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# -----------------------------
# DELETE PRODUCT
# -----------------------------
@router.delete("/{product_id}")
def delete_product(
    product_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    try:
        product = get_product_or_404(db, product_id, user["shop_id"])

        db.delete(product)
        db.commit()

        return {
            "success": True,
            "message": "Product deleted successfully"
        }

    except StarletteHTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))