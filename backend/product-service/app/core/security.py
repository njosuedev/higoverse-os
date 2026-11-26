import hashlib
import hmac

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

from app.core.config import settings

security = HTTPBearer()


# A car company's accountant may only view the expense book (expense-service).
# Every other part of the business is closed to them here.
def expenses_only(payload: dict) -> bool:
    return payload.get("layout") == "car" and payload.get("role") == "accountant"


EXPENSES_ONLY_DETAIL = "This account can only view expenses."


def internal_service_token() -> str:
    """Shared proof that a request comes from another Higoverse service (all
    services hold SECRET_KEY; browsers never do). Sale/purchase-service send
    it so they get real cost prices to compute profit for any user's sale."""
    return hmac.new(settings.SECRET_KEY.encode(), b"higoverse-internal-v1", hashlib.sha256).hexdigest()


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SECRET_KEY,
            algorithms=[settings.AUTH_SERVICE_ALGORITHM]
        )
        # (Signed calls from other Higoverse services are let through: sale-
        # service reads the cars' deposits for the accountant's ledger.)
        if expenses_only(payload) and not hmac.compare_digest(
            request.headers.get("X-Higoverse-Internal", ""), internal_service_token()
        ):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=EXPENSES_ONLY_DETAIL)

        return {
            "user_id": payload.get("sub"),
            "shop_id": payload.get("shop_id"),
            "email": payload.get("email"),
            "name": payload.get("name"),
            "role": payload.get("role"),
            "layout": payload.get("layout"),
            "internal": hmac.compare_digest(
                request.headers.get("X-Higoverse-Internal", ""), internal_service_token()
            ),
        }

    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )


# Roles that may see a car company's money figures (profit, loss, costs,
# stock value, revenue totals, expenses, reports). Everyone else at a car
# company is staff who only handle vehicles and sales.
FINANCIAL_ROLES = {"owner", "admin"}


def hides_financials(user: dict) -> bool:
    """True when this user works for a car company but isn't its owner.
    Signed calls from other Higoverse services always get full data."""
    if user.get("internal"):
        return False
    return user.get("layout") == "car" and user.get("role") not in FINANCIAL_ROLES

