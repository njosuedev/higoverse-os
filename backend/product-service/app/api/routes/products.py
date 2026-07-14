from fastapi import APIRouter, Depends, HTTPException, Header
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.product import Product
from app.schemas.product import ProductCreate, ProductUpdate
from app.core.security import get_current_user
from app.core.supplier_client import validate_supplier

router = APIRouter(prefix="/products", tags=["Products"])


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