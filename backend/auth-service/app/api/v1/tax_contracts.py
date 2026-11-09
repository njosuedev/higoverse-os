"""Tax advisory contracts with Higoverse's tax clients (models/tax_contract.py).

Platform admin only; making, changing or deleting one is noted in the admin
activity log. The web app prints them (apps/web lib/tax-contract-print.ts).

GET    /tax-contracts?client_id=     list (newest first)
GET    /tax-contracts/company        Higoverse's side as on the last contract,
                                     to fill in the next one
POST   /tax-contracts
POST   /tax-contracts/fill-missing   a contract for every client without one
GET    /tax-contracts/check?code=    a scanned contract's QR code
PATCH  /tax-contracts/{id}
DELETE /tax-contracts/{id}

Every tax client must have a contract: the clients list shows how many each
has, and fill-missing makes one for each client that has none, with their
agreed monthly fee and Higoverse's side as on the last contract.
Each printed contract carries a QR code (core/doc_code.py, kind "T").
"""
import uuid as _uuid
from datetime import date
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy.orm import Session

from app.api.v1.admin import _audit, require_admin
from app.core import doc_code
from app.core.company import clean_phone, clean_tin
from app.db.deps import get_db
from app.models.tax_client import TaxClient
from app.models.tax_contract import TaxContract

# Contracts are Higoverse's own documents: signed as the platform, not a shop.
_PLATFORM = "higoverse"
from app.models.user import User

router = APIRouter()


def _text(v, n=255):
    if v is None:
        return None
    v = " ".join(str(v).split())
    return v[:n] or None


class CompanySide(BaseModel):
    """Higoverse's details as printed on the contract."""
    name: str = Field("HIGOVERSE", max_length=120)
    tin: Optional[str] = Field(None, max_length=20)
    representative: Optional[str] = Field(None, max_length=120)
    title: Optional[str] = Field(None, max_length=120)
    phone: Optional[str] = Field(None, max_length=40)
    phone2: Optional[str] = Field(None, max_length=40)
    email: Optional[str] = Field(None, max_length=120)
    website: Optional[str] = Field(None, max_length=120)
    address: Optional[str] = Field(None, max_length=200)
    momo_code: Optional[str] = Field(None, max_length=40)
    bank_name: Optional[str] = Field(None, max_length=80)
    bank_account: Optional[str] = Field(None, max_length=60)

    @field_validator("*", mode="before")
    @classmethod
    def _tidy(cls, v):
        return _text(v, 200) if isinstance(v, str) else v


class ContractIn(BaseModel):
    client_id: Optional[str] = None
    contract_date: date
    start_date: date
    client_name: str = Field(..., min_length=1, max_length=255)
    client_tin: Optional[str] = None
    client_phone: Optional[str] = None
    client_representative: Optional[str] = Field(None, max_length=255)
    monthly_fee: Decimal = Field(..., gt=0, le=Decimal("1000000000"))
    payment_day: int = Field(28, ge=1, le=31)
    notes: Optional[str] = Field(None, max_length=2000)
    company: CompanySide = CompanySide()

    @field_validator("client_name", "client_representative", mode="before")
    @classmethod
    def _names(cls, v):
        return _text(v)

    @field_validator("client_phone", mode="before")
    @classmethod
    def _phone(cls, v):
        v = _text(v, 40)
        return clean_phone(v) if v else None

    @field_validator("client_tin", mode="before")
    @classmethod
    def _tin(cls, v):
        return clean_tin(_text(v, 20))

    @field_validator("notes", mode="before")
    @classmethod
    def _notes(cls, v):
        return (str(v).strip() or None) if v is not None else None

    @model_validator(mode="after")
    def _name_needed(self):
        if not self.client_name:
            raise ValueError("The client's name is required")
        return self


def _uuid_or_none(v: str | None):
    if not v:
        return None
    try:
        return _uuid.UUID(v)
    except ValueError:
        raise HTTPException(status_code=422, detail="Unknown client")


def _fmt(c: TaxContract) -> dict:
    return {
        "id": str(c.id), "client_id": str(c.client_id) if c.client_id else None,
        "contract_date": c.contract_date.isoformat(), "start_date": c.start_date.isoformat(),
        "client_name": c.client_name, "client_tin": c.client_tin, "client_phone": c.client_phone,
        "client_representative": c.client_representative, "monthly_fee": float(c.monthly_fee),
        "payment_day": c.payment_day, "notes": c.notes, "company": c.company or {},
        "created_by": c.created_by,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        # For the printed contract's QR (read in the admin panel).
        "doc_code": doc_code.make("T", _PLATFORM, str(c.id).replace("-", "")),
    }


def _get(db: Session, contract_id: str) -> TaxContract:
    try:
        cid = _uuid.UUID(contract_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Contract not found")
    c = db.query(TaxContract).filter(TaxContract.id == cid).first()
    if not c:
        raise HTTPException(status_code=404, detail="Contract not found")
    return c


@router.get("/tax-contracts")
def list_contracts(client_id: Optional[str] = None, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    q = db.query(TaxContract)
    if client_id:
        q = q.filter(TaxContract.client_id == _uuid_or_none(client_id))
    rows = q.order_by(TaxContract.contract_date.desc(), TaxContract.created_at.desc()).all()
    return {"success": True, "data": [_fmt(c) for c in rows]}


@router.get("/tax-contracts/company")
def last_company_side(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    last = db.query(TaxContract).order_by(TaxContract.created_at.desc()).first()
    return {"success": True, "data": (last.company if last else None) or {}}


@router.get("/tax-contracts/check")
def check_contract(code: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """A scanned contract: genuine (signed by Higoverse) and still on file."""
    found = doc_code.parse(code[:200], _PLATFORM)
    if found and found[0] == "T":
        try:
            c = db.query(TaxContract).filter(TaxContract.id == _uuid.UUID(found[1])).first()
        except ValueError:
            c = None
        if c:
            return {"success": True, "data": _fmt(c)}
    raise HTTPException(status_code=404, detail="This isn't a Higoverse contract, or it was deleted.")


@router.post("/tax-contracts/fill-missing")
def fill_missing(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """A contract for every tax client that has none, dated today and applying
    from the 1st of this month, with the client's agreed monthly fee and
    Higoverse's side as on the last contract. Clients with no agreed fee are
    skipped (named in the answer) so nothing is made with a wrong amount."""
    have = {cid for (cid,) in db.query(TaxContract.client_id).filter(TaxContract.client_id.isnot(None)).distinct()}
    last = db.query(TaxContract).order_by(TaxContract.created_at.desc()).first()
    company = (last.company if last else None) or {"name": "HIGOVERSE"}
    today = date.today()
    made, no_fee = [], []
    for cl in db.query(TaxClient).order_by(TaxClient.created_at.asc()).all():
        if cl.id in have:
            continue
        if not cl.monthly_fee or cl.monthly_fee <= 0:
            no_fee.append(cl.name)
            continue
        c = TaxContract(
            client_id=cl.id, contract_date=today, start_date=today.replace(day=1),
            client_name=cl.name, client_tin=cl.tin, client_phone=cl.phone, client_representative=cl.delegate,
            monthly_fee=cl.monthly_fee, payment_day=28, company=company, created_by=admin.email,
        )
        db.add(c)
        made.append(c)
    db.flush()
    for c in made:
        _audit(db, admin, "contract.create", "contract", c.id, c.client_name, fee=float(c.monthly_fee), bulk=True)
    db.commit()
    return {"success": True, "data": {"made": len(made), "no_fee": no_fee}}


@router.post("/tax-contracts", status_code=201)
def create_contract(body: ContractIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    data = body.model_dump()
    data["client_id"] = _uuid_or_none(data.get("client_id"))
    c = TaxContract(**data, created_by=admin.email)
    db.add(c)
    db.flush()
    _audit(db, admin, "contract.create", "contract", c.id, c.client_name, fee=float(c.monthly_fee))
    db.commit()
    db.refresh(c)
    return {"success": True, "data": _fmt(c)}


@router.patch("/tax-contracts/{contract_id}")
def update_contract(contract_id: str, body: ContractIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    c = _get(db, contract_id)
    data = body.model_dump()
    data["client_id"] = _uuid_or_none(data.get("client_id"))
    changed = [k for k, v in data.items() if getattr(c, k) != v]
    for k in changed:
        setattr(c, k, data[k])
    if changed:
        _audit(db, admin, "contract.edit", "contract", c.id, c.client_name, fields=changed)
    db.commit()
    db.refresh(c)
    return {"success": True, "data": _fmt(c)}


@router.delete("/tax-contracts/{contract_id}")
def delete_contract(contract_id: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    c = _get(db, contract_id)
    _audit(db, admin, "contract.delete", "contract", c.id, c.client_name, fee=float(c.monthly_fee),
           contract_date=c.contract_date.isoformat())
    db.delete(c)
    db.commit()
    return {"success": True}
