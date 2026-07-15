from fastapi import APIRouter, Depends, HTTPException, status
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.supplier import Supplier
from app.schemas.supplier import SupplierCreate, SupplierUpdate
from app.core.security import get_current_user

router = APIRouter(
    prefix="/suppliers",
    tags=["Suppliers"]
)


# =====================================
# HELPER
# =====================================

def get_supplier_or_404(
    db: Session,
    supplier_id: str,
    shop_id: str
):
    supplier = (
        db.query(Supplier)
        .filter(
            Supplier.id == supplier_id,
            Supplier.shop_id == shop_id
        )
        .first()
    )

    if not supplier:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Supplier not found"
        )

    return supplier


# =====================================
# CREATE SUPPLIER
# =====================================

@router.post("/")
def create_supplier(
    payload: SupplierCreate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    if not current_user["shop_id"]:
        raise HTTPException(status_code=404, detail="No shop associated with this account")

    try:
        supplier = Supplier(
            shop_id=current_user["shop_id"],
            name=payload.name,
            phone=payload.phone,
            email=payload.email,
            address=payload.address
        )

        db.add(supplier)
        db.commit()
        db.refresh(supplier)

        return {
            "success": True,
            "message": "Supplier created successfully",
            "data": {
                "id": supplier.id,
                "shop_id": supplier.shop_id,
                "name": supplier.name,
                "phone": supplier.phone,
                "email": supplier.email,
                "address": supplier.address
            }
        }

    except StarletteHTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# =====================================
# GET ALL SUPPLIERS
# =====================================

@router.get("/")
def get_suppliers(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    suppliers = (
        db.query(Supplier)
        .filter(
            Supplier.shop_id == current_user["shop_id"]
        )
        .all()
    )

    return {
        "success": True,
        "data": [
            {
                "id": supplier.id,
                "shop_id": supplier.shop_id,
                "name": supplier.name,
                "phone": supplier.phone,
                "email": supplier.email,
                "address": supplier.address
            }
            for supplier in suppliers
        ]
    }


# =====================================
# GET ONE SUPPLIER
# =====================================

@router.get("/{supplier_id}")
def get_supplier(
    supplier_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    supplier = get_supplier_or_404(
        db=db,
        supplier_id=supplier_id,
        shop_id=current_user["shop_id"]
    )

    return {
        "success": True,
        "data": {
            "id": supplier.id,
            "shop_id": supplier.shop_id,
            "name": supplier.name,
            "phone": supplier.phone,
            "email": supplier.email,
            "address": supplier.address
        }
    }


# =====================================
# UPDATE SUPPLIER
# =====================================

@router.put("/{supplier_id}")
def update_supplier(
    supplier_id: str,
    payload: SupplierUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    try:
        supplier = get_supplier_or_404(
            db=db,
            supplier_id=supplier_id,
            shop_id=current_user["shop_id"]
        )

        update_data = payload.model_dump(
            exclude_unset=True
        )

        for key, value in update_data.items():
            setattr(supplier, key, value)

        db.commit()
        db.refresh(supplier)

        return {
            "success": True,
            "message": "Supplier updated successfully",
            "data": {
                "id": supplier.id,
                "shop_id": supplier.shop_id,
                "name": supplier.name,
                "phone": supplier.phone,
                "email": supplier.email,
                "address": supplier.address
            }
        }

    except StarletteHTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


# =====================================
# DELETE SUPPLIER
# =====================================

@router.delete("/{supplier_id}")
def delete_supplier(
    supplier_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    supplier = get_supplier_or_404(
        db=db,
        supplier_id=supplier_id,
        shop_id=current_user["shop_id"]
    )

    db.delete(supplier)
    db.commit()

    return {
        "success": True,
        "message": "Supplier deleted successfully"
    }