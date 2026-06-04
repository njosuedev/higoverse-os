from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.product import Product
from app.schemas.product import ProductCreate, ProductUpdate

router = APIRouter(prefix="/products", tags=["Products"])


# -----------------------------
# Helpers
# -----------------------------
def get_product_or_404(db: Session, product_id: str):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


def calculate_profit(cost_price, selling_price):
    profit_money = selling_price - cost_price
    profit_percent = (profit_money / cost_price) * 100
    return profit_money, round(profit_percent, 2)

# -----------------------------
# ALL PRODUCT
# -----------------------------

@router.get("/")
def get_products(
    db: Session = Depends(get_db),
    page: int = 1,
    limit: int = 10
):
    try:
        offset = (page - 1) * limit

        products = (
            db.query(Product)
            .offset(offset)
            .limit(limit)
            .all()
        )

        total = db.query(Product).count()

        items = []

        for p in products:
            profit_money = p.selling_price - p.cost_price
            profit_percent = (profit_money / p.cost_price) * 100

            items.append({
                "id": p.id,
                "name": p.name,
                "cost_price": float(p.cost_price),
                "selling_price": float(p.selling_price),
                "quantity": p.quantity,

                # 💰 PROFIT / LOSS
                "profit_status": "profit" if profit_money >= 0 else "loss",
                "profit_money": float(profit_money),
                "profit_percent": round(float(profit_percent), 2)
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
        return {
            "success": False,
            "message": "Failed to fetch products",
            "error": str(e)
        }

# -----------------------------
# CREATE PRODUCT
# -----------------------------
@router.post("/")
def create_product(payload: ProductCreate, db: Session = Depends(get_db)):
    try:
        selling_price = payload.selling_price or payload.cost_price

        profit_money, profit_percent = calculate_profit(
            payload.cost_price,
            selling_price
        )

        product = Product(
            shop_id="shop-demo",
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
# GET PRODUCT
# -----------------------------
@router.get("/{product_id}")
def get_product(product_id: str, db: Session = Depends(get_db)):
    product = get_product_or_404(db, product_id)

    return {
        "success": True,
        "data": product
    }


# -----------------------------
# UPDATE PRODUCT
# -----------------------------
@router.put("/{product_id}")
def update_product(
    product_id: str,
    payload: ProductUpdate,
    db: Session = Depends(get_db)
):
    product = get_product_or_404(db, product_id)

    try:
        update_data = payload.model_dump(exclude_unset=True)

        for key, value in update_data.items():
            setattr(product, key, value)

        # auto fix selling price
        if product.selling_price is None:
            product.selling_price = product.cost_price

        db.commit()
        db.refresh(product)

        return {
            "success": True,
            "message": f"Product '{product.name}' updated successfully",
            "data": {
                "id": product.id,
                "name": product.name,
                "cost_price": float(product.cost_price),
                "selling_price": float(product.selling_price),
                "quantity": product.quantity
            }
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# -----------------------------
# DELETE PRODUCT
# -----------------------------
@router.delete("/{product_id}")
def delete_product(product_id: str, db: Session = Depends(get_db)):
    product = get_product_or_404(db, product_id)

    try:
        db.delete(product)
        db.commit()

        return {
            "success": True,
            "message": "Product deleted successfully"
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))