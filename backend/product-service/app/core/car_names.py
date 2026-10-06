"""Car companies pick a car's name from the list the owner keeps in Settings
(settings-service `car_names`); nobody types it on a vehicle. Until the list
has names, nothing is enforced, so a new company isn't blocked."""
import logging

import requests
from fastapi import HTTPException

from app.core.config import settings

logger = logging.getLogger(__name__)


def car_names(token: str) -> list[str]:
    try:
        res = requests.get(f"{settings.SETTINGS_SERVICE_URL}/settings/",
                           headers={"Authorization": f"Bearer {token}"}, timeout=10)
        if res.ok:
            names = (res.json().get("data") or {}).get("car_names") or []
            return [n for n in names if isinstance(n, str)]
        logger.warning("settings-service returned %s", res.status_code)
    except Exception as e:
        logger.error("settings-service unreachable: %s", e)
    return []


def check_car_name(name: str | None, user: dict, token: str) -> str | None:
    """The name as listed in Settings (its exact spelling), or 400."""
    if user.get("layout") != "car" or name is None:
        return name
    names = car_names(token)
    if not names:
        return name
    wanted = " ".join(name.split()).lower()
    for n in names:
        if n.lower() == wanted:
            return n
    raise HTTPException(status_code=400, detail="Choose the car name from the list (Settings → Car names).")
