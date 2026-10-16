from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

from app.core.config import settings

security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SECRET_KEY,
            algorithms=[settings.AUTH_SERVICE_ALGORITHM],
        )
        return {
            "user_id": payload.get("sub"),
            "shop_id": payload.get("shop_id"),
            "email": payload.get("email"),
            "name": payload.get("name"),
            "role": payload.get("role"),
            "layout": payload.get("layout"),
        }
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


# Roles that may see a car company's money figures (profit, loss, costs,
# stock value, revenue totals, expenses, reports). Everyone else at a car
# company is staff who only handle vehicles and sales.
FINANCIAL_ROLES = {"owner", "admin"}


def hides_financials(user: dict) -> bool:
    """True when this user works for a car company but isn't its owner."""
    return user.get("layout") == "car" and user.get("role") not in FINANCIAL_ROLES


# The expense book (the list, each expense, adding, editing,
# receipts) is kept by the owner, the manager and the accountant, in every
# kind of business; cashiers and storekeepers don't use it.
# Deleting an expense is further limited to the system admin (see the route).
EXPENSE_ROLES = FINANCIAL_ROLES | {"manager", "accountant"}


def require_expense_access(user: dict = Depends(get_current_user)) -> dict:
    """For the expense book: the owner, admins, the manager and the accountant."""
    if user.get("role") not in EXPENSE_ROLES:
        raise HTTPException(status_code=403, detail="Only the owner, a manager or the accountant can use expenses.")
    return user


def require_expense_totals(user: dict = Depends(get_current_user)) -> dict:
    """Expense totals (summary, by category, by day): whoever keeps the book,
    and whoever may see the business's money figures (Home, reports)."""
    if user.get("role") not in EXPENSE_ROLES and hides_financials(user):
        raise HTTPException(status_code=403, detail="Only the business owner can view this.")
    return user


def require_financial_access(user: dict = Depends(get_current_user)) -> dict:
    """Use instead of get_current_user on endpoints that are entirely
    financial: a car company's staff get a clear 403 instead of the data."""
    if hides_financials(user):
        raise HTTPException(status_code=403, detail="Only the business owner can view this.")
    return user

