from pydantic import BaseModel, EmailStr, field_validator, model_validator
from typing import Optional

from app.core.company import clean_phone, clean_tin

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
    # Required for new companies: printed on proformas and receipts.
    tin:            str
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

    @field_validator("shop_name")
    @classmethod
    def name_required(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Shop name is required")
        return v.strip()

    @field_validator("phone")
    @classmethod
    def phone_valid(cls, v: str) -> str:
        return clean_phone(v)

    @field_validator("tin")
    @classmethod
    def tin_valid(cls, v: str) -> str:
        tin = clean_tin(v)
        if not tin:
            raise ValueError("TIN is required (9 digits)")
        return tin

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
    """The owner's own changes (Settings). Phone can't be emptied once set."""
    name:        Optional[str] = None
    phone:       Optional[str] = None
    tin:         Optional[str] = None
    address:     Optional[str] = None
    description: Optional[str] = None
    logo_url:    Optional[str] = None

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and not v.strip():
            raise ValueError("Shop name can't be empty")
        return v.strip() if v is not None else v

    @field_validator("phone")
    @classmethod
    def phone_valid(cls, v: Optional[str]) -> Optional[str]:
        return clean_phone(v) if v is not None else v

    @field_validator("tin")
    @classmethod
    def tin_valid(cls, v: Optional[str]) -> Optional[str]:
        return clean_tin(v)


class AdminShopPatch(ShopUpdate):
    """The platform admin's edit of a shop: the owner's fields plus status
    and layout. Unknown keys are ignored, as before."""
    is_active:   Optional[bool] = None
    layout:      Optional[str] = None

    @field_validator("layout")
    @classmethod
    def layout_known(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in BUSINESS_LAYOUTS:
            raise ValueError(f"Unknown layout: {v}")
        return v


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
