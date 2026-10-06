"""The business's own team: its owner (or its admin) adds up to three
employees, switches them off or removes them. Everyone in the business can
list the team (Messages needs it).

GET    /api/v1/team             every account of my business
POST   /api/v1/team             add an employee            (owner/admin)
PATCH  /api/v1/team/{id}        change role / switch on-off (owner/admin)
DELETE /api/v1/team/{id}        remove an employee          (owner/admin)
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.core.auth_bearer import get_current_user
from app.core.permissions import default_permissions
from app.core.security import hash_password
from app.db.deps import get_db
from app.models.user import User

router = APIRouter()

MAX_EMPLOYEES = 3
MANAGERS = {"owner", "admin"}
EMPLOYEE_ROLES = {"manager", "cashier", "storekeeper", "accountant"}


class NewEmployee(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    role: str = "cashier"


class EmployeeChange(BaseModel):
    role: str | None = None
    is_active: bool | None = None


def _fmt(u: User) -> dict:
    return {
        "id": str(u.id),
        "name": u.name or u.email,
        "email": u.email,
        "role": u.role,
        "is_active": bool(u.is_active),
        "is_employee": u.role in EMPLOYEE_ROLES,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


def _my_shop(user: User):
    if not user.shop_id:
        raise HTTPException(status_code=400, detail="This account has no business.")
    return user.shop_id


def _require_manager(user: User) -> None:
    if user.role not in MANAGERS:
        raise HTTPException(status_code=403, detail="Only the business owner can manage the team.")


def _employees(db: Session, shop_id):
    return db.query(User).filter(User.shop_id == shop_id, User.role.in_(EMPLOYEE_ROLES))


def _employee_or_404(db: Session, shop_id, user_id: str) -> User:
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Employee not found.")
    u = _employees(db, shop_id).filter(User.id == uid).first()
    if not u:
        raise HTTPException(status_code=404, detail="Employee not found.")
    return u


@router.get("/team")
def list_team(db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    shop_id = _my_shop(me)
    people = db.query(User).filter(User.shop_id == shop_id).order_by(User.created_at.asc()).all()
    return {
        "success": True,
        "data": {
            "members": [_fmt(u) for u in people],
            "max_employees": MAX_EMPLOYEES,
            "employees": sum(1 for u in people if u.role in EMPLOYEE_ROLES),
            "can_manage": me.role in MANAGERS,
        },
    }


@router.post("/team")
def add_employee(payload: NewEmployee, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    _require_manager(me)
    shop_id = _my_shop(me)
    if payload.role not in EMPLOYEE_ROLES:
        raise HTTPException(status_code=422, detail=f"Role must be one of: {', '.join(sorted(EMPLOYEE_ROLES))}")
    if _employees(db, shop_id).count() >= MAX_EMPLOYEES:
        raise HTTPException(status_code=400, detail=f"A business can have up to {MAX_EMPLOYEES} employees. Remove one first.")
    email = payload.email.strip().lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="An account with this email already exists.")
    u = User(
        name=payload.name.strip(),
        email=email,
        password_hash=hash_password(payload.password),
        shop_id=me.shop_id,
        role=payload.role,
        permissions=default_permissions(payload.role),
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return {"success": True, "message": "Employee added", "data": _fmt(u)}


@router.patch("/team/{user_id}")
def change_employee(user_id: str, payload: EmployeeChange, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    _require_manager(me)
    u = _employee_or_404(db, _my_shop(me), user_id)
    if payload.role is not None:
        if payload.role not in EMPLOYEE_ROLES:
            raise HTTPException(status_code=422, detail=f"Role must be one of: {', '.join(sorted(EMPLOYEE_ROLES))}")
        u.role = payload.role
        u.permissions = default_permissions(payload.role)
    if payload.is_active is not None:
        u.is_active = payload.is_active
    db.commit()
    db.refresh(u)
    return {"success": True, "data": _fmt(u)}


@router.delete("/team/{user_id}")
def remove_employee(user_id: str, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    _require_manager(me)
    u = _employee_or_404(db, _my_shop(me), user_id)
    db.delete(u)
    db.commit()
    return {"success": True, "message": "Employee removed"}
