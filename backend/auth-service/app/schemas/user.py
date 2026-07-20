from pydantic import BaseModel, EmailStr
from typing import Optional


# Platform admin registers a staff member into an existing shop.
class AdminCreateUserRequest(BaseModel):
    shop_id:  str
    email:    EmailStr
    password: str
    name:     Optional[str] = None
    role:     str = "cashier"
