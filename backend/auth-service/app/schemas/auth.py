from pydantic import BaseModel, EmailStr

# REGISTER SHOP + OWNER
class RegisterShopRequest(BaseModel):
    shop_name: str
    email: EmailStr
    password: str
    phone: str | None = None


# LOGIN
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"