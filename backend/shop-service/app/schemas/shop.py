from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ShopUpdate(BaseModel):
    """Fields an owner can update on their own shop."""
    name:        Optional[str] = Field(None, min_length=1, max_length=255)
    phone:       Optional[str] = Field(None, max_length=50)
    address:     Optional[str] = Field(None, max_length=500)
    description: Optional[str] = None


class ShopAdminUpdate(ShopUpdate):
    """Superset — admins can also flip is_active."""
    is_active: Optional[bool] = None


class ShopResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:          str
    name:        str
    email:       Optional[str]
    phone:       Optional[str]
    address:     Optional[str]
    description: Optional[str]
    is_active:   bool
    created_at:  Optional[str]
    updated_at:  Optional[str]
