import os
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

AUTH_SECRET = os.getenv("AUTH_SERVICE_SECRET")
ALGORITHM = os.getenv("AUTH_SERVICE_ALGORITHM", "HS256")

security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    try:
        payload = jwt.decode(
            credentials.credentials,
            AUTH_SECRET,
            algorithms=[ALGORITHM]
        )

        return {
            "user_id": payload.get("sub"),
            "shop_id": payload.get("shop_id"),
            "role": payload.get("role")
        }

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
