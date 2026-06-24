from pydantic import BaseModel
from typing import Optional, Any


class NotificationCreate(BaseModel):
    user_id: str
    type:    str
    title:   str
    body:    Optional[str] = None
    data:    Optional[dict[str, Any]] = None


class NotificationOut(BaseModel):
    id:         str
    user_id:    str
    type:       str
    title:      str
    body:       Optional[str]
    data:       Optional[dict]
    is_read:    bool
    created_at: str

    class Config:
        from_attributes = True
