from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.security import get_current_user, require_admin
from app.db.database import get_db
from app.schemas.shop import ShopUpdate, ShopAdminUpdate
from app.services import shop_service

router = APIRouter(prefix="/shops", tags=["Shops"])


# ── Public directory ──────────────────────────────────────────────────────────

@router.get("/")
def list_shops(
    search:      Optional[str] = Query(None, description="Filter by name, email or address"),
    active_only: bool          = Query(True,  description="Return only active shops"),
    page:        int           = Query(1,  ge=1),
    limit:       int           = Query(20, ge=1, le=100),
    db:          Session       = Depends(get_db),
    user:        dict          = Depends(get_current_user),
):
    """Return a paginated, searchable list of all shops."""
    data = shop_service.list_shops(db, search=search, active_only=active_only, page=page, limit=limit)
    return {"success": True, "data": data}


@router.get("/me")
def get_my_shop(
    db:   Session = Depends(get_db),
    user: dict    = Depends(get_current_user),
):
    """Return the authenticated user's own shop profile."""
    return {"success": True, "data": shop_service.get_my_shop(db, user["shop_id"])}


@router.put("/me")
def update_my_shop(
    payload: ShopUpdate,
    db:      Session = Depends(get_db),
    user:    dict    = Depends(get_current_user),
):
    """Update the authenticated user's shop profile (name, phone, address, description)."""
    data = shop_service.update_my_shop(db, user["shop_id"], payload)
    return {"success": True, "message": "Shop updated", "data": data}


# ── Shop by ID (public profile) ───────────────────────────────────────────────

@router.get("/{shop_id}")
def get_shop(
    shop_id: str,
    db:      Session = Depends(get_db),
    user:    dict    = Depends(get_current_user),
):
    """Return a specific shop's public profile."""
    return {"success": True, "data": shop_service.get_my_shop(db, shop_id)}


# ── Admin endpoints ───────────────────────────────────────────────────────────

@router.patch("/{shop_id}")
def admin_update_shop(
    shop_id: str,
    payload: ShopAdminUpdate,
    db:      Session = Depends(get_db),
    admin:   dict    = Depends(require_admin),
):
    """Admin: update any shop's fields including is_active."""
    data = shop_service.admin_update_shop(db, shop_id, payload)
    return {"success": True, "message": "Shop updated by admin", "data": data}


@router.post("/{shop_id}/toggle")
def toggle_shop(
    shop_id: str,
    db:      Session = Depends(get_db),
    admin:   dict    = Depends(require_admin),
):
    """Admin: activate or deactivate a shop."""
    data = shop_service.toggle_shop_status(db, shop_id)
    status = "activated" if data["is_active"] else "deactivated"
    return {"success": True, "message": f"Shop {status}", "data": data}
