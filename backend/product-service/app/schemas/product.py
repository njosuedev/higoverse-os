import json
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field, field_validator

MAX_IMAGES = 7
MAX_IMAGE_CHARS = 2_000_000      # one base64 data-URL (~1.5 MB of JPEG)
MAX_THUMBNAIL_CHARS = 100_000


def _check_images(v: str | None) -> str | None:
    """`images` is a JSON list of up to 7 base64 image data-URLs."""
    if v is None or v == "":
        return None
    try:
        imgs = json.loads(v)
    except ValueError:
        raise ValueError("images must be a JSON list")
    if not isinstance(imgs, list):
        raise ValueError("images must be a JSON list")
    if len(imgs) > MAX_IMAGES:
        raise ValueError(f"At most {MAX_IMAGES} images")
    for img in imgs:
        if not isinstance(img, str) or not img.startswith("data:image/"):
            raise ValueError("Each image must be an image data URL")
        if len(img) > MAX_IMAGE_CHARS:
            raise ValueError("An image is too large")
    return json.dumps(imgs) if imgs else None


def _check_thumbnail(v: str | None) -> str | None:
    if v is None or v == "":
        return None
    if not v.startswith("data:image/") or len(v) > MAX_THUMBNAIL_CHARS:
        raise ValueError("Invalid thumbnail")
    return v


# =====================================
# CREATE PRODUCT
# =====================================

class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None

    cost_price: Decimal = Field(..., gt=0)
    selling_price: Decimal | None = Field(None, gt=0)

    quantity: int = Field(..., ge=0)

    barcode: str | None = Field(None, max_length=255)

    supplier_id: str | None = None

    category: str | None = Field(None, max_length=100)
    images: str | None = None  # JSON-encoded list of base64 strings
    thumbnail: str | None = None  # small data-URL of the first image
    attributes: str | None = None  # JSON-encoded dict, layout-specific fields

    @field_validator("images")
    @classmethod
    def valid_images(cls, v: str | None) -> str | None:
        return _check_images(v)

    @field_validator("thumbnail")
    @classmethod
    def valid_thumbnail(cls, v: str | None) -> str | None:
        return _check_thumbnail(v)


# =====================================
# UPDATE PRODUCT
# =====================================

class ProductUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None

    cost_price: Decimal | None = Field(None, gt=0)
    selling_price: Decimal | None = Field(None, gt=0)

    quantity: int | None = Field(None, ge=0)

    barcode: str | None = Field(None, max_length=255)

    supplier_id: str | None = None

    category: str | None = Field(None, max_length=100)
    images: str | None = None
    thumbnail: str | None = None
    attributes: str | None = None

    @field_validator("images")
    @classmethod
    def valid_images(cls, v: str | None) -> str | None:
        return _check_images(v)

    @field_validator("thumbnail")
    @classmethod
    def valid_thumbnail(cls, v: str | None) -> str | None:
        return _check_thumbnail(v)


# =====================================
# RESPONSE PRODUCT
# =====================================

class ProductResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True
    )

    id: str
    shop_id: str

    supplier_id: str | None = None

    name: str
    description: str | None = None

    cost_price: Decimal
    selling_price: Decimal

    quantity: int

    barcode: str | None = None

    category: str | None = None
    images: str | None = None
    attributes: str | None = None


# =====================================
# OPTIONAL: PRODUCT LIST ITEM
# =====================================

class ProductListItem(BaseModel):
    id: str
    name: str

    supplier_id: str | None = None

    cost_price: Decimal
    selling_price: Decimal

    quantity: int

    profit_money: float
    profit_percent: float

    category: str | None = None
    images: str | None = None
    attributes: str | None = None
