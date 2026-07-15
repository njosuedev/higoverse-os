from pydantic import BaseModel, EmailStr
from typing import Optional


# Platform admin provisions a shop + its first Owner staff member in one call —
# shops are never created by self-registration.
class AdminCreateShopRequest(BaseModel):
    shop_name:    str
    owner_email:  EmailStr
    owner_password: str
    owner_name:   Optional[str] = None
    phone:        Optional[str] = None
    address:      Optional[str] = None
    description:  Optional[str] = None
    logo_url:     Optional[str] = None


class ShopUpdate(BaseModel):
    name:        Optional[str] = None
    phone:       Optional[str] = None
    address:     Optional[str] = None
    description: Optional[str] = None
    logo_url:    Optional[str] = None


class ShopResponse(BaseModel):
    id:          str
    name:        str
    email:       Optional[str]
    phone:       Optional[str]
    address:     Optional[str]
    description: Optional[str]
    logo_url:    Optional[str]
    is_active:   bool
    created_at:  Optional[str]
    updated_at:  Optional[str]
