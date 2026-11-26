from fastapi import Depends, HTTPException, status
from fastapi.security import (
    HTTPBearer,
    HTTPAuthorizationCredentials
)

from jose import jwt, JWTError

from app.core.config import settings


security = HTTPBearer()


# A car company's accountant may only view the expense book (expense-service).
# Every other part of the business is closed to them here.
def expenses_only(payload: dict) -> bool:
    return payload.get("layout") == "car" and payload.get("role") == "accountant"


EXPENSES_ONLY_DETAIL = "This account can only view expenses."


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SECRET_KEY,
            algorithms=[settings.AUTH_SERVICE_ALGORITHM]
        )
        if expenses_only(payload):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=EXPENSES_ONLY_DETAIL)

        return {
            "user_id": payload.get("sub"),
            "shop_id": payload.get("shop_id"),
            "email": payload.get("email"),
            "role": payload.get("role")
        }

    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token"
        )