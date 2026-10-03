from fastapi import APIRouter, Depends, HTTPException, Header
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy import case, func
from sqlalchemy.orm import Session, defer

from app.db.database import get_db
from app.models.product import Product
from app.schemas.product import ProductCreate, ProductUpdate
from app.core.security import get_current_user, hides_financials
from app.core.supplier_client import validate_supplier

router = APIRouter(prefix="/products", tags=["Products"])


# Money fields a car company's staff must not see (see hides_financials).
_FINANCIAL_KEYS = {"cost_price", "profit_status", "profit_money", "profit_percent",
                   "stock_value", "cost_value", "potential_profit"}


def _scrub(user: dict, value):
    """Blank out financial fields for users who may not see them."""
    if not hides_financials(user):
        return value
    if isinstance(value, dict):
        return {k: (None if k in _FINANCIAL_KEYS else _scrub(user, v)) for k, v in value.items()}
    if isinstance(value, list):
        return [_scrub(user, v) for v in value]
    return value


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


# Car companies keep a vehicle's sale status and traffic-penalty record in the
# `attributes` JSON text (written by the web app). These match it without
# parsing JSON in SQL, so one malformed row can never break the query.
_PENDING_RE = r'"sale_status"\s*:\s*"pending"'
_PENALTY_RE = r'"penalty_count"\s*:\s*"?[1-9]'


def _attr_matches(pattern: str):
    return func.coalesce(Product.attributes, "").op("~")(pattern)


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
    threshold: int = 10,  # the shop's Settings → low stock threshold
):
    if not user["shop_id"]:
        return _scrub(user, {
            "success": True,
            "data": {
                "stock_value": 0.0, "cost_value": 0.0, "potential_profit": 0.0,
                "total_products": 0, "total_quantity": 0, "out_of_stock": 0, "low_stock": 0,
                "pending": 0, "with_penalties": 0,
            },
        })

    row = db.query(Product).filter(Product.shop_id == user["shop_id"]).with_entities(
        func.coalesce(func.sum(Product.selling_price * Product.quantity), 0).label("stock_value"),
        func.coalesce(func.sum(Product.cost_price * Product.quantity), 0).label("cost_value"),
        func.coalesce(func.sum((Product.selling_price - Product.cost_price) * Product.quantity), 0).label("potential_profit"),
        func.count(Product.id).label("total_products"),
        func.coalesce(func.sum(Product.quantity), 0).label("total_quantity"),
        func.sum(case((Product.quantity == 0, 1), else_=0)).label("out_of_stock"),
        func.sum(case(((Product.quantity > 0) & (Product.quantity <= threshold), 1), else_=0)).label("low_stock"),
        func.sum(case(((Product.quantity > 0) & _attr_matches(_PENDING_RE), 1), else_=0)).label("pending"),
        func.sum(case((_attr_matches(_PENALTY_RE), 1), else_=0)).label("with_penalties"),
    ).one()

    return _scrub(user, {
        "success": True,
        "data": {
            "stock_value": float(row.stock_value),
            "cost_value": float(row.cost_value),
            "potential_profit": float(row.potential_profit),
            "total_products": int(row.total_products),
            "total_quantity": int(row.total_quantity),
            "out_of_stock": int(row.out_of_stock or 0),
            "low_stock": int(row.low_stock or 0),
            "pending": int(row.pending or 0),
            "with_penalties": int(row.with_penalties or 0),
        },
    })


# -----------------------------
# STOCK ALERTS (for report-service)
# -----------------------------
@router.get("/stock-alerts")
def get_stock_alerts(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    threshold: int = 10,
):
    if not user["shop_id"]:
        return _scrub(user, {"success": True, "data": []})

    items = db.query(Product).filter(
        Product.shop_id == user["shop_id"],
        Product.quantity <= threshold,
    ).order_by(Product.quantity.asc()).all()

    return _scrub(user, {
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
    })


# -----------------------------
# GET ALL PRODUCTS
# -----------------------------
@router.get("/")
def get_products(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    page: int = 1,
    limit: int = 10,
    q: str | None = None,         # name / barcode search (backed by the trigram index)
    category: str | None = None,
    stock: str | None = None,     # "low" | "out" | "restock" | "in"
    status: str | None = None,    # car companies: "available" | "pending" | "sold" | "penalties"
    threshold: int = 10,          # the shop's low-stock threshold, for stock="low"/"in"
):
    page = max(page, 1)
    limit = min(max(limit, 1), 1000)
    if not user["shop_id"]:
        return _scrub(user, {"success": True, "data": {"items": [], "total": 0, "page": page, "limit": limit}})

    offset = (page - 1) * limit

    query = db.query(Product).filter(Product.shop_id == user["shop_id"])

    if q and q.strip():
        term = f"%{q.strip()}%"
        # attributes holds e.g. a car's plate/chassis numbers as JSON text.
        query = query.filter(Product.name.ilike(term) | Product.barcode.ilike(term) | Product.attributes.ilike(term))
    if category:
        query = query.filter(Product.category == category)
    if stock == "out":
        query = query.filter(Product.quantity == 0)
    elif stock == "low":
        query = query.filter(Product.quantity > 0, Product.quantity <= threshold)
    elif stock == "restock":  # low + out of stock
        query = query.filter(Product.quantity <= threshold)
    elif stock == "in":
        query = query.filter(Product.quantity > threshold)

    if status == "sold":
        query = query.filter(Product.quantity == 0)
    elif status == "pending":
        query = query.filter(Product.quantity > 0, _attr_matches(_PENDING_RE))
    elif status == "available":
        query = query.filter(Product.quantity > 0, ~_attr_matches(_PENDING_RE))
    elif status == "penalties":
        query = query.filter(_attr_matches(_PENALTY_RE))

    total = query.count()
    # Full images can be several MB per product — lists only send the thumbnail.
    # Newest first, with id as a tie-breaker so pages never overlap or skip rows.
    query = query.options(defer(Product.images)).order_by(Product.created_at.desc(), Product.id)
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
            "thumbnail": p.thumbnail,
            "attributes": p.attributes,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "profit_status": "profit" if profit >= 0 else "loss",
            "profit_money": float(profit),
            "profit_percent": percent
        })

    return _scrub(user, {
        "success": True,
        "data": {
            "items": items,
            "total": total,
            "page": page,
            "limit": limit
        }
    })


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
    if not user["shop_id"]:
        raise HTTPException(status_code=400, detail="You need a shop before adding products")

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
            thumbnail=payload.thumbnail,
            attributes=payload.attributes,
        )

        db.add(product)
        db.commit()
        db.refresh(product)

        profit, percent = calculate_profit(
            product.cost_price,
            product.selling_price
        )

        return _scrub(user, {
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
        })

    except StarletteHTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))



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

    return _scrub(user, {
        "success": True,
        "data": {
            "id": product.id,
            "name": product.name,
            "supplier_id": product.supplier_id,
            "description": product.description,
            "category": product.category,
            "images": product.images,
            "thumbnail": product.thumbnail,
            "attributes": product.attributes,
            "cost_price": float(product.cost_price),
            "selling_price": float(product.selling_price),
            "quantity": product.quantity,
            "profit_money": float(profit),
            "profit_percent": percent
        }
    })


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

        return _scrub(user, {
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
        })

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