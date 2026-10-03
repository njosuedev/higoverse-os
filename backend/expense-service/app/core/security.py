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


def require_financial_access(user: dict = Depends(get_current_user)) -> dict:
    """Use instead of get_current_user on endpoints that are entirely
    financial: a car company's staff get a clear 403 instead of the data."""
    if hides_financials(user):
        raise HTTPException(status_code=403, detail="Only the business owner can view this.")
    return user

