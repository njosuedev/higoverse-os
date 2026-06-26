from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import get_current_user
from app.db.database import get_db
from app.models.notification import Notification
from app.schemas.notification import CreateNotificationPayload

router = APIRouter(tags=["Notifications"])


def _to_dict(n: Notification) -> dict:
    return {
        "id":         str(n.id),
        "user_id":    str(n.user_id),
        "type":       n.type,
        "title":      n.title,
        "body":       n.body,
        "data":       n.data or {},
        "is_read":    n.is_read,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


# Internal service-to-service endpoint
@router.post("/api/v1/internal/notify", include_in_schema=False)
def internal_notify(
    payload:       CreateNotificationPayload,
    x_service_key: str = Header(None, alias="X-Service-Key"),
    db:            Session = Depends(get_db),
):
    if not settings.SERVICE_KEY or x_service_key != settings.SERVICE_KEY:
        raise HTTPException(status_code=403, detail="Unauthorized")
    notif = Notification(
        user_id=payload.user_id,
        type=payload.type,
        title=payload.title,
        body=payload.body,
        data=payload.data,
    )
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return {"success": True, "data": _to_dict(notif)}


# User-facing endpoints
@router.get("/api/v1/notifications/unread-count")
def unread_count(
    db:   Session = Depends(get_db),
    user: dict    = Depends(get_current_user),
):
    count = (
        db.query(Notification)
        .filter(Notification.user_id == str(user["user_id"]), Notification.is_read == False)
        .count()
    )
    return {"success": True, "data": {"count": count}}


@router.patch("/api/v1/notifications/read-all")
def mark_all_read(
    db:   Session = Depends(get_db),
    user: dict    = Depends(get_current_user),
):
    db.query(Notification).filter(
        Notification.user_id == str(user["user_id"]),
        Notification.is_read == False,
    ).update({"is_read": True})
    db.commit()
    return {"success": True}


@router.get("/api/v1/notifications")
def list_notifications(
    limit: int     = Query(50, ge=1, le=200),
    db:    Session = Depends(get_db),
    user:  dict    = Depends(get_current_user),
):
    notifs = (
        db.query(Notification)
        .filter(Notification.user_id == str(user["user_id"]))
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .all()
    )
    return {"success": True, "data": [_to_dict(n) for n in notifs]}


@router.patch("/api/v1/notifications/{notif_id}/read")
def mark_read(
    notif_id: str,
    db:       Session = Depends(get_db),
    user:     dict    = Depends(get_current_user),
):
    notif = db.query(Notification).filter(
        Notification.id == notif_id,
        Notification.user_id == str(user["user_id"]),
    ).first()
    if not notif:
        raise HTTPException(404, "Not found")
    notif.is_read = True
    db.commit()
    return {"success": True}


@router.delete("/api/v1/notifications/{notif_id}")
def delete_notification(
    notif_id: str,
    db:       Session = Depends(get_db),
    user:     dict    = Depends(get_current_user),
):
    db.query(Notification).filter(
        Notification.id == notif_id,
        Notification.user_id == str(user["user_id"]),
    ).delete()
    db.commit()
    return {"success": True}


@router.delete("/api/v1/notifications")
def delete_all(
    db:   Session = Depends(get_db),
    user: dict    = Depends(get_current_user),
):
    db.query(Notification).filter(
        Notification.user_id == str(user["user_id"])
    ).delete()
    db.commit()
    return {"success": True}
