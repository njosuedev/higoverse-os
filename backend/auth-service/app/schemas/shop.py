from pydantic import BaseModel, EmailStr, field_validator, model_validator
from typing import Optional

# UI templates a business can be assigned. Only the platform admin sets this
# (admin create/patch); shop owners can't change it from their own settings.
# Keep in sync with BUSINESS_LAYOUTS in apps/web/lib/business-layout.ts.
BUSINESS_LAYOUTS = ("retail", "car")


# Platform admin provisions a shop, optionally with a first Owner staff member,
# in one call — shops are never created by self-registration. Phone is always
# required; an owner login account (email + password) is only created when the
# shop needs platform access — a directory-only shop can omit both.
class AdminCreateShopRequest(BaseModel):
    shop_name:      str
    phone:          str
    owner_email:    Optional[EmailStr] = None
    owner_password: Optional[str] = None
    owner_name:     Optional[str] = None
    address:        Optional[str] = None
    description:    Optional[str] = None
    logo_url:       Optional[str] = None
    layout:         str = "retail"

    @field_validator("layout")
    @classmethod
    def layout_known(cls, v: str) -> str:
        if v not in BUSINESS_LAYOUTS:
            raise ValueError(f"Unknown layout: {v}")
        return v

    @field_validator("phone")
    @classmethod
    def phone_required(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Phone number is required")
        return v.strip()

    @model_validator(mode="after")
    def owner_credentials_paired(self):
        has_email = bool(self.owner_email)
        has_password = bool(self.owner_password)
        if has_email != has_password:
            raise ValueError("Owner email and password must be provided together, or both left empty")
        if has_password and len(self.owner_password) < 8:
            raise ValueError("Owner password must be at least 8 characters")
        return self


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
    email_verified: bool
    created_at:  Optional[str]
    updated_at:  Optional[str]
