import hashlib
from passlib.context import CryptContext
from datetime import datetime, timedelta
from jose import jwt
from app.core.config import settings

# -------------------
# PASSWORD HASHING (argon2 - safer than bcrypt)
# -------------------

pwd_context = CryptContext(
    schemes=["argon2"],
    deprecated="auto"
)

def normalize_password(password: str):
    # still safe, but now no bcrypt limitation issues
    return hashlib.sha256(password.encode()).hexdigest()


def hash_password(password: str):
    normalized = normalize_password(password)
    return pwd_context.hash(normalized)


def verify_password(plain_password: str, hashed_password: str):
    normalized = normalize_password(plain_password)
    return pwd_context.verify(normalized, hashed_password)


# -------------------
# JWT TOKEN
# -------------------

def create_access_token(data: dict):
    to_encode = data.copy()

    expire = datetime.utcnow() + timedelta(
        minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
    )

    to_encode.update({"exp": expire})

    return jwt.encode(
        to_encode,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )