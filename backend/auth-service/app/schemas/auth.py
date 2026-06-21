from pydantic import BaseModel, EmailStr

# REGISTER SHOP + OWNER
class RegisterShopRequest(BaseModel):
    shop_name:   str
    email:       EmailStr
    password:    str
    phone:       str | None = None
    address:     str | None = None
    description: str | None = None
    logo_url:    str | None = None
    role:        str = "owner"


# LOGIN
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    otp: str
    new_password: str


class VerifyRegistrationRequest(BaseModel):
    email: EmailStr
    otp: str