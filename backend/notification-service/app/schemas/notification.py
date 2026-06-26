from datetime import datetime
from typing import Any, Dict, Optional
from pydantic import BaseModel


class NotificationOut(BaseModel):
    id:         str
    user_id:    str
    type:       str
    title:      str
    body:       Optional[str] = None
    data:       Dict[str, Any] = {}
    is_read:    bool
    created_at: str

    model_config = {"from_attributes": True}


class CreateNotificationPayload(BaseModel):
    user_id: str
    type:    str = "system"
    title:   str
    body:    Optional[str] = None
    data:    Dict[str, Any] = {}
