"""Higoverse's income from its tax clients: what is expected each month (the
agreed fees of clients whose contract has started) and what was really
received (payments recorded here). Platform admin only; recording or
deleting a payment is noted in the admin activity log.

GET    /tax-income?period=YYYY-MM&months=6   the month's figures, each
                                             client's, and the months before
GET    /tax-payments?client_id=              a client's payments, newest first
GET    /tax-payments/balance?client_id=&period=   expected, paid and left for a month
POST   /tax-payments
DELETE /tax-payments/{id}

A month can't be paid for more than once: a payment is refused when it
would take the month's total over the fee expected for it (and when no
contract had started by then), so what is received stays accurate.
"""
import uuid as _uuid
from datetime import date
from decimal import Decimal
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.v1.admin import _audit, require_admin
from app.db.deps import get_db
from app.models.tax_client import TaxClient
from app.models.tax_contract import TaxContract
from app.models.tax_payment import TaxPayment
from app.models.user import User

router = APIRouter()


def _period(p: str) -> str:
    try:
        y, m = p.split("-")
        if len(y) != 4 or not 1 <= int(m) <= 12:
            raise ValueError
        return f"{int(y):04d}-{int(m):02d}"
    except ValueError:
        raise HTTPException(status_code=422, detail="Month must be YYYY-MM")


def _shift(p: str, n: int) -> str:
    y, m = map(int, p.split("-"))
    k = y * 12 + (m - 1) + n
    return f"{k // 12:04d}-{k % 12 + 1:02d}"


def _month_end(p: str) -> date:
    y, m = map(int, _shift(p, 1).split("-"))
    return date.fromordinal(date(y, m, 1).toordinal() - 1)


class PaymentIn(BaseModel):
    client_id: str
    period: str
    amount: Decimal = Field(..., gt=0, le=Decimal("1000000000"))
    paid_on: date
    method: Optional[Literal["cash", "mtn", "bank"]] = None
    reference: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=1000)

    @field_validator("reference", "notes", mode="before")
    @classmethod
    def _tidy(cls, v):
        if v is None:
            return None
        v = " ".join(str(v).split())
        return v or None


def _fmt(p: TaxPayment) -> dict:
    return {
        "id": str(p.id), "client_id": str(p.client_id), "period": p.period, "amount": float(p.amount),
        "paid_on": p.paid_on.isoformat(), "method": p.method, "reference": p.reference, "notes": p.notes,
        "created_by": p.created_by, "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def _expected(contracts: list[TaxContract], clients: dict, period: str) -> dict:
    """Client id → the fee expected for [period]: their latest contract that
    had started by the end of that month (a client with no started contract
    owes nothing yet)."""
    end = _month_end(period)
    out: dict = {}
    for c in contracts:   # oldest first, so the latest started one wins
        if c.client_id in clients and c.start_date <= end:
            out[c.client_id] = float(c.monthly_fee)
    return out


@router.get("/tax-income")
def income(period: Optional[str] = None, months: int = 6, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    period = _period(period) if period else date.today().strftime("%Y-%m")
    months = max(1, min(months, 24))
    clients = {c.id: c for c in db.query(TaxClient).all()}
    contracts = db.query(TaxContract).filter(TaxContract.client_id.isnot(None)) \
        .order_by(TaxContract.start_date.asc(), TaxContract.created_at.asc()).all()
    first = _shift(period, -(months - 1))
    received = {}   # (period, client id) → amount
    for cid, per, amt in db.query(TaxPayment.client_id, TaxPayment.period, func.sum(TaxPayment.amount)) \
            .filter(TaxPayment.period >= first, TaxPayment.period <= period) \
            .group_by(TaxPayment.client_id, TaxPayment.period):
        received[(per, cid)] = float(amt)

    history = []
    for i in range(months):
        p = _shift(first, i)
        exp = _expected(contracts, clients, p)
        got = sum(v for (per, _cid), v in received.items() if per == p)
        history.append({"period": p, "expected": sum(exp.values()), "received": got})

    exp_now = _expected(contracts, clients, period)
    per_client = []
    for cid, cl in clients.items():
        e, r = exp_now.get(cid, 0.0), received.get((period, cid), 0.0)
        status = "none" if not e and not r else "paid" if r >= e else "partial" if r > 0 else "unpaid"
        per_client.append({"client_id": str(cid), "expected": e, "received": r, "status": status})
    now = history[-1]
    return {"success": True, "data": {
        "period": period,
        "expected": now["expected"],
        "received": now["received"],
        "outstanding": max(0.0, sum(max(0.0, c["expected"] - c["received"]) for c in per_client)),
        "clients_expected": sum(1 for c in per_client if c["expected"] > 0),
        "clients_paid": sum(1 for c in per_client if c["status"] == "paid" and c["expected"] > 0),
        "clients": per_client,
        "history": history,
    }}


def _balance(db: Session, client_id, period: str) -> dict:
    """What [client_id] owes for [period]: the fee of their latest contract
    started by the end of the month, what is already paid, and what's left."""
    end = _month_end(period)
    c = db.query(TaxContract).filter(TaxContract.client_id == client_id, TaxContract.start_date <= end) \
        .order_by(TaxContract.start_date.desc(), TaxContract.created_at.desc()).first()
    expected = float(c.monthly_fee) if c else 0.0
    paid = float(db.query(func.coalesce(func.sum(TaxPayment.amount), 0))
                 .filter(TaxPayment.client_id == client_id, TaxPayment.period == period).scalar() or 0)
    return {"period": period, "expected": expected, "paid": paid, "left": max(0.0, round(expected - paid, 2))}


@router.get("/tax-payments/balance")
def balance(client_id: str, period: str, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    try:
        cid = _uuid.UUID(client_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"success": True, "data": _balance(db, cid, _period(period))}


@router.get("/tax-payments")
def payments(client_id: Optional[str] = None, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    q = db.query(TaxPayment)
    if client_id:
        try:
            q = q.filter(TaxPayment.client_id == _uuid.UUID(client_id))
        except ValueError:
            raise HTTPException(status_code=404, detail="Client not found")
    rows = q.order_by(TaxPayment.period.desc(), TaxPayment.paid_on.desc()).limit(500).all()
    return {"success": True, "data": [_fmt(p) for p in rows]}


@router.post("/tax-payments", status_code=201)
def record_payment(body: PaymentIn, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    try:
        cid = _uuid.UUID(body.client_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Client not found")
    client = db.query(TaxClient).filter(TaxClient.id == cid).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    period = _period(body.period)
    # Lock the client's row so two payments sent at once can't both pass the check.
    db.query(TaxClient).filter(TaxClient.id == cid).with_for_update().first()
    bal = _balance(db, cid, period)
    if bal["expected"] <= 0:
        raise HTTPException(status_code=409, detail=f"No contract had started for {period}: nothing is owed for that month.")
    if float(body.amount) > bal["left"] + 0.005:
        if bal["left"] <= 0:
            raise HTTPException(status_code=409, detail=f"{period} is already paid in full ({bal['paid']:,.0f} of {bal['expected']:,.0f} Rwf).")
        raise HTTPException(status_code=409, detail=f"Only {bal['left']:,.0f} Rwf is left to pay for {period} ({bal['paid']:,.0f} of {bal['expected']:,.0f} already paid).")
    p = TaxPayment(client_id=cid, period=period, amount=body.amount, paid_on=body.paid_on,
                   method=body.method, reference=body.reference, notes=body.notes, created_by=admin.email)
    db.add(p)
    db.flush()
    _audit(db, admin, "payment.create", "payment", p.id, client.name, amount=float(p.amount), period=p.period)
    db.commit()
    db.refresh(p)
    return {"success": True, "data": _fmt(p)}


@router.delete("/tax-payments/{payment_id}")
def delete_payment(payment_id: str, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    try:
        p = db.query(TaxPayment).filter(TaxPayment.id == _uuid.UUID(payment_id)).first()
    except ValueError:
        p = None
    if not p:
        raise HTTPException(status_code=404, detail="Payment not found")
    client = db.query(TaxClient).filter(TaxClient.id == p.client_id).first()
    _audit(db, admin, "payment.delete", "payment", p.id, client.name if client else None, amount=float(p.amount), period=p.period)
    db.delete(p)
    db.commit()
    return {"success": True}
