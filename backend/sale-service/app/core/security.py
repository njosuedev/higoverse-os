from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

from app.core.config import settings

security = HTTPBearer()


# A car company's accountant may only view the expense book (expense-service)
# and the general ledger (routes/ledger.py). Everything else is closed to them.
def expenses_only(payload: dict) -> bool:
    return payload.get("layout") == "car" and payload.get("role") == "accountant"


EXPENSES_ONLY_DETAIL = "This account can only view expenses."


def _ledger_read(request: Request) -> bool:
    route = getattr(request.scope.get("route"), "path", "") or request.url.path
    if request.method == "POST" and route == "/sales/printed":
        return True  # the QR code on the PDFs they export (expenses, ledger)
    return request.method in ("GET", "HEAD") and (route == "/ledger" or route.startswith("/ledger/"))


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
):
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SECRET_KEY,
            algorithms=[settings.AUTH_SERVICE_ALGORITHM],
        )
        if expenses_only(payload) and not _ledger_read(request):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=EXPENSES_ONLY_DETAIL)
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

