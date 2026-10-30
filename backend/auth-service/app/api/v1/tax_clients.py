"""Higoverse's tax clients: the companies and people whose taxes we file.

Platform admin only. Kept in the auth database, apart from every company's
own data; adding, editing or deleting one is noted in the admin activity log.
"""
import uuid as _uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.api.v1.admin import _audit, require_admin
from app.core.company import clean_phone, clean_tin
from app.db.deps import get_db
from app.models.tax_client import TaxClient
from app.models.user import User

router = APIRouter()

_FIELDS = ("name", "delegate", "phone", "tin", "notes")


def _blank_to_none(v):
    if v is None:
        return None
    v = str(v).strip()
    return v or None


class TaxClientIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    delegate: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = None
    tin: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=2000)

    @field_validator("name")
    @classmethod
    def _name(cls, v):
        if v is None:
            return None
        v = " ".join(str(v).split())
        if not v:
            raise ValueError("Name is required")
        return v

    @field_validator("delegate", "notes", mode="before")
    @classmethod
    def _text(cls, v):
        return _blank_to_none(v)

    @field_validator("phone", mode="before")
    @classmethod
    def _phone(cls, v):
        v = _blank_to_none(v)
        return clean_phone(v) if v else None

    @field_validator("tin", mode="before")
    @classmethod
    def _tin(cls, v):
        return clean_tin(_blank_to_none(v))


class TaxClientPatch(TaxClientIn):
    name: Optional[str] = Field(None, min_length=1, max_length=255)


class TaxClientImport(BaseModel):
    rows: list[TaxClientIn] = Field(..., min_length=1, max_length=2000)


def _fmt(c: TaxClient) -> dict:
    return {
        "id": str(c.id), "name": c.name, "delegate": c.delegate, "phone": c.phone,
        "tin": c.tin, "notes": c.notes,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


def _get(db: Session, client_id: str) -> TaxClient:
    try:
        cid = _uuid.UUID(client_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Client not found")
    c = db.query(TaxClient).filter(TaxClient.id == cid).first()
    if not c:
        raise HTTPException(status_code=404, detail="Client not found")
    return c


def _tin_taken(db: Session, tin: str | None, except_id=None) -> bool:
    if not tin:
        return False
    q = db.query(TaxClient.id).filter(TaxClient.tin == tin)
    if except_id is not None:
        q = q.filter(TaxClient.id != except_id)
    return q.first() is not None


@router.get("/tax-clients")
def list_tax_clients(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    rows = db.query(TaxClient).order_by(TaxClient.created_at.asc(), TaxClient.name.asc()).all()
    return {"success": True, "data": [_fmt(c) for c in rows]}


@router.post("/tax-clients", status_code=201)
def create_tax_client(body: TaxClientIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if _tin_taken(db, body.tin):
        raise HTTPException(status_code=409, detail="A client with this TIN is already on the list")
    c = TaxClient(**body.model_dump())
    db.add(c)
    db.flush()
    _audit(db, admin, "client.create", "client", c.id, c.name)
    db.commit()
    db.refresh(c)
    return {"success": True, "data": _fmt(c)}


@router.post("/tax-clients/import")
def import_tax_clients(body: TaxClientImport, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Adds many at once (pasted from a spreadsheet). A row whose TIN is
    already on the list, or repeats one above it, is skipped, never changed."""
    seen: set[str] = set()
    added, skipped = [], []
    # One microsecond apart, so the list keeps the order they were pasted in.
    base = datetime.now(timezone.utc)
    for row in body.rows:
        if row.tin and (row.tin in seen or _tin_taken(db, row.tin)):
            skipped.append(row.name)
            continue
        if row.tin:
            seen.add(row.tin)
        c = TaxClient(**row.model_dump(), created_at=base + timedelta(microseconds=len(added)))
        db.add(c)
        added.append(c)
    db.flush()
    if added:
        _audit(db, admin, "client.import", "client", None, f"{len(added)}", count=len(added))
    db.commit()
    return {"success": True, "data": {"added": len(added), "skipped": skipped}}


@router.patch("/tax-clients/{client_id}")
def update_tax_client(client_id: str, body: TaxClientPatch, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    c = _get(db, client_id)
    changes = body.model_dump(exclude_unset=True)
    if "name" in changes and not changes["name"]:
        raise HTTPException(status_code=422, detail="Name is required")
    if "tin" in changes and _tin_taken(db, changes["tin"], except_id=c.id):
        raise HTTPException(status_code=409, detail="A client with this TIN is already on the list")
    changed = [f for f in _FIELDS if f in changes and getattr(c, f) != changes[f]]
    for f in changed:
        setattr(c, f, changes[f])
    if changed:
        _audit(db, admin, "client.edit", "client", c.id, c.name, fields=changed)
    db.commit()
    db.refresh(c)
    return {"success": True, "data": _fmt(c)}


@router.delete("/tax-clients/{client_id}")
def delete_tax_client(client_id: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    c = _get(db, client_id)
    _audit(db, admin, "client.delete", "client", c.id, c.name, tin=c.tin)
    db.delete(c)
    db.commit()
    return {"success": True}
