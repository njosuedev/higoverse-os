from fastapi import Depends, HTTPException, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from pydantic import BaseModel
from typing import Optional

from app.core.config import settings

security = HTTPBearer()


class TokenData(BaseModel):
    user_id: str


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> TokenData:
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        user_id: str | None = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        return TokenData(user_id=user_id)
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def verify_internal_key(x_internal_key: Optional[str] = Header(default=None)) -> None:
    if not settings.INTERNAL_API_KEY:
        return
    if x_internal_key != settings.INTERNAL_API_KEY:
        raise HTTPException(status_code=403, detail="Internal key required")
