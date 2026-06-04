import hashlib
from datetime import datetime, timedelta

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings


# --------------------------------
# PASSWORD HASHING
# --------------------------------

pwd_context = CryptContext(
    schemes=["argon2"],
    deprecated="auto"
)


def normalize_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def hash_password(password: str) -> str:
    return pwd_context.hash(
        normalize_password(password)
    )


def verify_password(
    plain_password: str,
    hashed_password: str
) -> bool:
    return pwd_context.verify(
        normalize_password(plain_password),
        hashed_password
    )


# --------------------------------
# JWT TOKEN
# --------------------------------

def create_access_token(data: dict) -> str:
    payload = data.copy()

    expire = datetime.utcnow() + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload["exp"] = expire

    token = jwt.encode(
        payload,
        settings.AUTH_SERVICE_SECRET,
        algorithm=settings.AUTH_SERVICE_ALGORITHM
    )

    return token
