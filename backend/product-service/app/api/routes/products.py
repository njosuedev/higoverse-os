import base64
import io
import json
from collections import OrderedDict
from fastapi import APIRouter, Depends, HTTPException, Header
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session, defer

from app.db.database import get_db
from app.models.product import Product
from app.schemas.product import ProductCreate, ProductUpdate
from app.core.security import get_current_user, hides_financials
from app.core.supplier_client import validate_supplier
from app.core.events import emit

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
def _car_state(attributes) -> dict:
    """The parts of a car's details that live apps alert on."""
    try:
        a = json.loads(attributes) if isinstance(attributes, str) and attributes else {}
    except ValueError:
        a = {}
    if not isinstance(a, dict):
        a = {}
    try:
        fines = int(a.get("penalty_count") or 0)
    except (TypeError, ValueError):
        fines = 0
    return {"penalty_count": fines, "sale_status": a.get("sale_status") or None}


def _live(product, **extra) -> dict:
    """A product as live apps receive it — no photos (too big for an event)."""
    attrs = product.attributes if isinstance(product.attributes, str) and len(product.attributes) < 2000 else None
    return {
        "id": product.id,
        "name": product.name,
        "quantity": product.quantity,
        "selling_price": float(product.selling_price) if product.selling_price is not None else None,
        "cost_price": float(product.cost_price) if product.cost_price is not None else None,
        "category": product.category,
        "barcode": product.barcode,
        "attributes": attrs,
        **extra,
    }


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


def _attr_filled(key: str):
    """The attribute is present with a non-empty value (string or number)."""
    return _attr_matches(r'"%s"\s*:\s*"?[^"\s,}]' % key)


# Details every car in stock should have, so staff can find, show and
# transfer it. A pending car also needs the buyer's phone and ID.
_CAR_DETAILS = ("plate_no", "chassis_no", "year", "color", "car_type")


def _incomplete_car():
    pending = _attr_matches(_PENDING_RE)
    return (Product.quantity > 0) & or_(
        *[~_attr_filled(k) for k in _CAR_DETAILS],
        func.coalesce(Product.thumbnail, "") == "",
        pending & ~(_attr_filled("buyer_phone") & _attr_filled("buyer_id_no")),
    )


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
                "pending": 0, "with_penalties": 0, "incomplete": 0,
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
        func.sum(case((_incomplete_car(), 1), else_=0)).label("incomplete"),
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
            "incomplete": int(row.incomplete or 0),
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
@router.get("", include_in_schema=False)
def get_products(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    page: int = 1,
    limit: int = 10,
    q: str | None = None,         # name / barcode search (backed by the trigram index)
    category: str | None = None,
    stock: str | None = None,     # "low" | "out" | "restock" | "in"
    status: str | None = None,    # car companies: "available" | "pending" | "sold" | "penalties" | "incomplete"
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
    elif status == "incomplete":
        query = query.filter(_incomplete_car())

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
@router.post("", include_in_schema=False)
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
        db.flush()
        emit(db, user, "product.created", _live(product))
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
# COVERS (sharp photos for the mobile app)
# -----------------------------
# Lists carry a 160px thumbnail; the app's cards and stories want something
# sharper without downloading each full 1280px photo. This returns each
# product's first photo resized to `size` px (longest side), as a JPEG data
# URL, cached in memory per photo and size.
_COVER_CACHE: "OrderedDict[tuple, str]" = OrderedDict()
_COVER_CACHE_MAX = 400


def _first_image(images, thumbnail):
    try:
        lst = json.loads(images) if images else []
    except ValueError:
        lst = []
    if isinstance(lst, list):
        for it in lst:
            if isinstance(it, str) and it.startswith("data:"):
                return it
    return thumbnail if isinstance(thumbnail, str) and thumbnail.startswith("data:") else None


def _resize_data_url(data_url: str, size: int) -> str:
    try:
        from PIL import Image  # optional: without Pillow the photo goes as stored
    except ImportError:
        return data_url
    try:
        raw = base64.b64decode(data_url.split(",", 1)[1])
        img = Image.open(io.BytesIO(raw))
        if max(img.size) <= size:
            return data_url
        img = img.convert("RGB")
        img.thumbnail((size, size), Image.LANCZOS)
        out = io.BytesIO()
        img.save(out, format="JPEG", quality=82, optimize=True, progressive=True)
        return "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode()
    except Exception:
        return data_url


@router.get("/covers")
def get_covers(
    ids: str,
    size: int = 640,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    if not user["shop_id"]:
        return {"success": True, "data": {}}
    wanted = [i for i in dict.fromkeys(x.strip() for x in ids.split(",")) if i][:30]
    size = min(max(size, 160), 1280)
    rows = (
        db.query(Product.id, Product.images, Product.thumbnail)
        .filter(Product.shop_id == user["shop_id"], Product.id.in_(wanted))
        .all()
    )
    out = {}
    for pid, images, thumbnail in rows:
        src = _first_image(images, thumbnail)
        if not src:
            continue
        key = (pid, len(src), src[-32:], size)
        cover = _COVER_CACHE.get(key)
        if cover is None:
            cover = _resize_data_url(src, size)
            _COVER_CACHE[key] = cover
            while len(_COVER_CACHE) > _COVER_CACHE_MAX:
                _COVER_CACHE.popitem(last=False)
        else:
            _COVER_CACHE.move_to_end(key)
        out[pid] = cover
    return {"success": True, "data": out}


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

        prev_quantity = product.quantity
        prev_car = _car_state(product.attributes)
        for key, value in update_data.items():
            setattr(product, key, value)

        if product.selling_price is None:
            product.selling_price = product.cost_price

        emit(db, user, "product.updated", _live(
            product,
            prev_quantity=prev_quantity,
            prev_penalty_count=prev_car["penalty_count"],
            prev_sale_status=prev_car["sale_status"],
        ))
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

        emit(db, user, "product.deleted", {"id": product.id, "name": product.name})
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