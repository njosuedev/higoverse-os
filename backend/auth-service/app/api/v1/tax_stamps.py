"""Stamps with signatures printed on tax contracts (platform admin only):
Higoverse's own, used on every contract, and each tax client's. Images are
kept in the database as data URLs (PNG, JPEG or WebP, at most ~1.5 MB);
setting or removing one is noted in the admin activity log.

GET    /tax-stamps/company               Higoverse's stamp, or null
PUT    /tax-stamps/company               {data}
DELETE /tax-stamps/company
GET    /tax-clients/{id}/stamp           the client's stamp, or null
PUT    /tax-clients/{id}/stamp           {data}
DELETE /tax-clients/{id}/stamp
"""
import re
import uuid as _uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.api.v1.admin import _audit, require_admin
from app.db.deps import get_db
from app.models.platform_asset import PlatformAsset
from app.models.tax_client import TaxClient
from app.models.user import User

router = APIRouter()

COMPANY_STAMP = "company_stamp"
_IMAGE = re.compile(r"^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$")


class StampIn(BaseModel):
    data: str = Field(..., max_length=2_000_000)

    @field_validator("data")
    @classmethod
    def _image(cls, v: str) -> str:
        v = v.strip()
        if not _IMAGE.match(v):
            raise ValueError("Send a PNG, JPEG or WebP image")
        return v


def _client(db: Session, client_id: str) -> TaxClient:
    try:
        c = db.query(TaxClient).filter(TaxClient.id == _uuid.UUID(client_id)).first()
    except ValueError:
        c = None
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    return c


@router.get("/tax-stamps/company")
def company_stamp(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    a = db.query(PlatformAsset).filter(PlatformAsset.key == COMPANY_STAMP).first()
    return {"success": True, "data": a.data if a else None}


@router.put("/tax-stamps/company")
def set_company_stamp(body: StampIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    a = db.query(PlatformAsset).filter(PlatformAsset.key == COMPANY_STAMP).first()
    if a:
        a.data, a.updated_by = body.data, admin.email
    else:
        db.add(PlatformAsset(key=COMPANY_STAMP, data=body.data, updated_by=admin.email))
    _audit(db, admin, "stamp.company", "stamp", None, "HIGOVERSE")
    db.commit()
    return {"success": True}


@router.delete("/tax-stamps/company")
def remove_company_stamp(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    a = db.query(PlatformAsset).filter(PlatformAsset.key == COMPANY_STAMP).first()
    if a:
        db.delete(a)
        _audit(db, admin, "stamp.company_remove", "stamp", None, "HIGOVERSE")
        db.commit()
    return {"success": True}


@router.get("/tax-clients/{client_id}/stamp")
def client_stamp(client_id: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    return {"success": True, "data": _client(db, client_id).stamp}


@router.put("/tax-clients/{client_id}/stamp")
def set_client_stamp(client_id: str, body: StampIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    c = _client(db, client_id)
    c.stamp = body.data
    _audit(db, admin, "stamp.client", "client", c.id, c.name)
    db.commit()
    return {"success": True}


@router.delete("/tax-clients/{client_id}/stamp")
def remove_client_stamp(client_id: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    c = _client(db, client_id)
    if c.stamp:
        c.stamp = None
        _audit(db, admin, "stamp.client_remove", "client", c.id, c.name)
        db.commit()
    return {"success": True}
