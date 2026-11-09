"""Car rentals (car companies): who rents which car, from when to when, for
how much, and the deposit (kosiyo). The web app prints each one as the
rental agreement, in the language the user picks.

GET    /rentals                 list (status=active|returned|cancelled, search)
POST   /rentals                 record a rental
GET    /rentals/{id}
PUT    /rentals/{id}            correct an active rental
POST   /rentals/{id}/return     the car came back: deposit given back, note
POST   /rentals/{id}/cancel
DELETE /rentals/{id}            owner, admin or manager
"""
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core import master_data
from app.core.security import get_current_user
from app.db.database import get_db
from app.models.rental import CarRental
from app.schemas.rental import RentalIn, RentalReturn

router = APIRouter(prefix="/rentals", tags=["Rentals"])

MANAGER_ROLES = {"owner", "admin", "manager"}


def _shop(user: dict) -> str:
    if not user.get("shop_id"):
        raise HTTPException(status_code=400, detail="This account has no business.")
    return str(user["shop_id"])


def _token(authorization: str | None) -> str:
    return (authorization or "").removeprefix("Bearer ").strip()


def _num(v) -> float:
    return float(v or 0)


def _fmt(r: CarRental) -> dict:
    return {
        "id": r.id,
        "rental_no": r.rental_no,
        "customer_id": r.customer_id,
        "customer": r.customer,
        "customer_phone": r.customer_phone or "",
        "customer_id_no": r.customer_id_no or "",
        "customer_address": r.customer_address or "",
        "product_id": r.product_id,
        "car_name": r.car_name,
        "car_type": r.car_type or "",
        "plate_no": r.plate_no or "",
        "chassis_no": r.chassis_no or "",
        "start_date": r.start_date,
        "end_date": r.end_date,
        "agreement_date": r.agreement_date,
        "rent_amount": _num(r.rent_amount),
        "deposit": _num(r.deposit),
        "currency": r.currency,
        "notes": r.notes or "",
        "status": r.status,
        "returned_at": r.returned_at.isoformat() if r.returned_at else None,
        "deposit_returned": None if r.deposit_returned is None else _num(r.deposit_returned),
        "return_note": r.return_note or "",
        "created_by_name": r.created_by_name or "",
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def _get(db: Session, rental_id: str, shop: str) -> CarRental:
    r = db.query(CarRental).filter(CarRental.id == rental_id, CarRental.shop_id == shop).first()
    if not r:
        raise HTTPException(status_code=404, detail="Rental not found.")
    return r


def _fill(data: dict, token: str) -> dict:
    """The renter's and the car's details from where they live (Customers,
    Vehicles) when picked there; typed ones are kept as typed."""
    data = dict(data)
    if data.get("customer_id"):
        c = master_data.customer_fields(data["customer_id"], token)
        data.update({
            "customer": c["customer"] or data.get("customer") or "",
            "customer_phone": c["customer_phone"] or data.get("customer_phone"),
            "customer_id_no": c["customer_id_no"] or data.get("customer_id_no"),
            "customer_address": c["customer_address"] or data.get("customer_address"),
        })
    if data.get("product_id"):
        v = master_data.vehicle_line({"product_id": data["product_id"], "product_name": data.get("car_name") or ""}, token)
        data.update({
            "car_name": v["product_name"] or data.get("car_name") or "",
            "car_type": v["car_type"] or data.get("car_type"),
            "plate_no": v["plate_no"] or data.get("plate_no"),
            "chassis_no": v["chassis_no"] or data.get("chassis_no"),
        })
    return data


def _next_no(db: Session, shop: str) -> str:
    n = db.query(func.count(CarRental.id)).filter(CarRental.shop_id == shop).scalar() or 0
    while True:
        n += 1
        no = f"RENT-{n:04d}"
        if not db.query(CarRental.id).filter(CarRental.shop_id == shop, CarRental.rental_no == no).first():
            return no


@router.get("")
def list_rentals(
    status: str | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    if not user.get("shop_id"):
        return {"success": True, "data": []}
    q = db.query(CarRental).filter(CarRental.shop_id == user["shop_id"])
    if status:
        q = q.filter(CarRental.status == status)
    if search:
        like = f"%{search[:80]}%"
        q = q.filter(or_(CarRental.rental_no.ilike(like), CarRental.customer.ilike(like), CarRental.car_name.ilike(like),
                         CarRental.plate_no.ilike(like), CarRental.customer_phone.ilike(like)))
    rows = q.order_by(CarRental.created_at.desc()).limit(500).all()
    return {"success": True, "data": [_fmt(r) for r in rows]}


@router.post("")
def create_rental(
    payload: RentalIn,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    authorization: str = Header(None),
):
    shop = _shop(user)
    data = _fill(payload.model_dump(mode="json"), _token(authorization))
    data["agreement_date"] = data.get("agreement_date") or date.today().isoformat()
    r = CarRental(shop_id=shop, rental_no=_next_no(db, shop), status="active",
                  created_by=str(user.get("user_id") or ""), created_by_name=user.get("name") or user.get("email") or "",
                  **data)
    db.add(r)
    db.commit()
    db.refresh(r)
    return {"success": True, "message": "Rental recorded", "data": _fmt(r)}


@router.get("/{rental_id}")
def get_rental(rental_id: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    return {"success": True, "data": _fmt(_get(db, rental_id, _shop(user)))}


@router.put("/{rental_id}")
def update_rental(
    rental_id: str,
    payload: RentalIn,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
    authorization: str = Header(None),
):
    r = _get(db, rental_id, _shop(user))
    if r.status != "active":
        raise HTTPException(status_code=400, detail="Only an active rental can be changed.")
    data = _fill(payload.model_dump(mode="json"), _token(authorization))
    data["agreement_date"] = data.get("agreement_date") or r.agreement_date
    for k, v in data.items():
        setattr(r, k, v)
    db.commit()
    db.refresh(r)
    return {"success": True, "data": _fmt(r)}


@router.post("/{rental_id}/return")
def return_car(rental_id: str, payload: RentalReturn, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    r = _get(db, rental_id, _shop(user))
    if r.status != "active":
        raise HTTPException(status_code=400, detail="This rental is already closed.")
    if payload.deposit_returned > (r.deposit or 0):
        raise HTTPException(status_code=400, detail="You can't give back more than the deposit.")
    r.status = "returned"
    r.returned_at = datetime.now(timezone.utc)
    r.deposit_returned = payload.deposit_returned
    r.return_note = " ".join((payload.return_note or "").split()) or None
    db.commit()
    db.refresh(r)
    return {"success": True, "data": _fmt(r)}


@router.post("/{rental_id}/cancel")
def cancel_rental(rental_id: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    r = _get(db, rental_id, _shop(user))
    if r.status != "active":
        raise HTTPException(status_code=400, detail="This rental is already closed.")
    r.status = "cancelled"
    db.commit()
    db.refresh(r)
    return {"success": True, "data": _fmt(r)}


@router.delete("/{rental_id}")
def delete_rental(rental_id: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    if user.get("role") not in MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Only the owner or a manager can delete a rental.")
    r = _get(db, rental_id, _shop(user))
    db.delete(r)
    db.commit()
    return {"success": True}
