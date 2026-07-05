from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

from app.core.config import settings

security = HTTPBearer()
security_optional = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SECRET_KEY,
            algorithms=[settings.AUTH_SERVICE_ALGORITHM]
        )

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


def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_optional)
):
    """Same as get_current_user but never raises — returns None for anonymous
    or invalid/expired tokens. Only for public read-only endpoints
    (e.g. the marketplace listing) that must work for logged-out visitors."""
    if credentials is None:
        return None

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SECRET_KEY,
            algorithms=[settings.AUTH_SERVICE_ALGORITHM]
        )

        return {
            "user_id": payload.get("sub"),
            "shop_id": payload.get("shop_id"),
            "email": payload.get("email"),
            "role": payload.get("role")
        }

    except JWTError:
        return None
