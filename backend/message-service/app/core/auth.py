from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from pydantic import BaseModel

from app.core.config import settings

security = HTTPBearer()


class TokenData(BaseModel):
    user_id: str
    shop_id: str | None = None


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
        return TokenData(user_id=user_id, shop_id=payload.get("shop_id"))
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
