from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.product import Product
from app.schemas.product import ProductCreate, ProductUpdate
from app.core.security import get_current_user

router = APIRouter(prefix="/products", tags=["Products"])


# -----------------------------
# Helpers
# -----------------------------
def get_product_or_404(db: Session, product_id: str, shop_id: str):
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.shop_id == shop_id
    ).first()

    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    return product


def calculate_profit(cost_price, selling_price):
    if cost_price == 0:
        return 0, 0

    profit_money = selling_price - cost_price
    profit_percent = (profit_money / cost_price) * 100

    return profit_money, round(profit_percent, 2)


# -----------------------------
# ALL PRODUCTS (SHOP SAFE)
# -----------------------------
@router.get("/")
def get_products(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    page: int = 1,
    limit: int = 10
):
    try:
        offset = (page - 1) * limit

        query = db.query(Product).filter(
            Product.shop_id == user["shop_id"]
        )

        total = query.count()

        products = query.offset(offset).limit(limit).all()

        items = []

        for p in products:
            profit_money, profit_percent = calculate_profit(
                p.cost_price,
                p.selling_price
            )

            items.append({
                "id": p.id,
                "name": p.name,
                "description": p.description,
                "cost_price": float(p.cost_price),
                "selling_price": float(p.selling_price),
                "quantity": p.quantity,

                "profit_status": "profit" if profit_money >= 0 else "loss",
                "profit_money": float(profit_money),
                "profit_percent": profit_percent
            })

        return {
            "success": True,
            "message": "Products fetched successfully",
            "data": {
                "items": items,
                "total": total,
                "page": page,
                "limit": limit
            }
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# -----------------------------
# CREATE PRODUCT (SHOP SAFE)
# -----------------------------
@router.post("/")
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    try:
        selling_price = payload.selling_price or payload.cost_price

        product = Product(
            shop_id=user["shop_id"],  # 🔥 IMPORTANT FIX
            name=payload.name,
            description=payload.description,
            cost_price=payload.cost_price,
            selling_price=selling_price,
            quantity=payload.quantity,
            barcode=payload.barcode,
        )

        db.add(product)
        db.commit()
        db.refresh(product)

        profit_money, profit_percent = calculate_profit(
            product.cost_price,
            product.selling_price
        )

        return {
            "success": True,
            "message": f"Product '{product.name}' created successfully",
            "data": {
                "id": product.id,
                "name": product.name,
                "cost_price": float(product.cost_price),
                "selling_price": float(product.selling_price),
                "quantity": product.quantity,
                "profit_money": float(profit_money),
                "profit_percent": profit_percent
            }
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# -----------------------------
# GET SINGLE PRODUCT (SHOP SAFE)
# -----------------------------
@router.get("/{product_id}")
def get_product(
    product_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    product = get_product_or_404(db, product_id, user["shop_id"])

    return {
        "success": True,
        "data": {
            "id": product.id,
            "name": product.name,
            "description": product.description,
            "cost_price": float(product.cost_price),
            "selling_price": float(product.selling_price),
            "quantity": product.quantity
        }
    }


# -----------------------------
# UPDATE PRODUCT (SHOP SAFE)
# -----------------------------
@router.put("/{product_id}")
def update_product(
    product_id: str,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):
    try:
        product = get_product_or_404(db, product_id, user["shop_id"])

        update_data = payload.model_dump(exclude_unset=True)

        for key, value in update_data.items():
            setattr(product, key, value)

        # auto default selling price
        if product.selling_price is None:
            product.selling_price = product.cost_price

        db.commit()
        db.refresh(product)

        profit_money, profit_percent = calculate_profit(
            product.cost_price,
            product.selling_price
        )

        return {
            "success": True,
            "message": f"Product '{product.name}' updated successfully",
            "data": {
                "id": product.id,
                "name": product.name,
                "cost_price": float(product.cost_price),
                "selling_price": float(product.selling_price),
                "quantity": product.quantity,
                "profit_money": float(profit_money),
                "profit_percent": profit_percent
            }
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# -----------------------------
# DELETE PRODUCT (SHOP SAFE)
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

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
