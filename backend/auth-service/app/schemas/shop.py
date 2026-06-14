from pydantic import BaseModel
from typing import Optional


class ShopUpdate(BaseModel):
    name:        Optional[str] = None
    phone:       Optional[str] = None
    address:     Optional[str] = None
    description: Optional[str] = None


class ShopResponse(BaseModel):
    id:          str
    name:        str
    email:       Optional[str]
    phone:       Optional[str]
    address:     Optional[str]
    description: Optional[str]
    is_active:   bool
    created_at:  Optional[str]
    updated_at:  Optional[str]
