from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, verify_internal_key, TokenData
from app.db.session import get_db
from app.models.notification import Notification
from app.schemas.notification import NotificationCreate

router = APIRouter()


def _fmt(n: Notification) -> dict:
    return {
        "id":         str(n.id),
        "user_id":    n.user_id,
        "type":       n.type,
        "title":      n.title,
        "body":       n.body,
        "data":       n.data or {},
        "is_read":    n.is_read,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


@router.get("/notifications")
def list_notifications(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    items = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.user_id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .all()
    )
    return {"success": True, "data": [_fmt(n) for n in items]}


@router.get("/notifications/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    count = db.query(func.count(Notification.id)).filter(
        Notification.user_id == current_user.user_id,
        Notification.is_read == False,
    ).scalar() or 0
    return {"success": True, "data": {"count": count}}


@router.post("/notifications")
def create_notification(
    payload: NotificationCreate,
    db: Session = Depends(get_db),
    _: None = Depends(verify_internal_key),
):
    """Service-to-service endpoint — requires X-Internal-Key header."""
    n = Notification(
        user_id=payload.user_id,
        type=payload.type,
        title=payload.title,
        body=payload.body,
        data=payload.data or {},
    )
    db.add(n)
    db.commit()
    db.refresh(n)
    return {"success": True, "data": _fmt(n)}


@router.patch("/notifications/{notif_id}/read")
def mark_read(
    notif_id: str,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    n = db.query(Notification).filter(
        Notification.id == notif_id,
        Notification.user_id == current_user.user_id,
    ).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.is_read = True
    db.commit()
    return {"success": True}


@router.patch("/notifications/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    db.query(Notification).filter(
        Notification.user_id == current_user.user_id,
        Notification.is_read == False,
    ).update({"is_read": True})
    db.commit()
    return {"success": True}


@router.delete("/notifications/{notif_id}")
def delete_notification(
    notif_id: str,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    n = db.query(Notification).filter(
        Notification.id == notif_id,
        Notification.user_id == current_user.user_id,
    ).first()
    if not n:
        raise HTTPException(status_code=404, detail="Notification not found")
    db.delete(n)
    db.commit()
    return {"success": True}


@router.delete("/notifications")
def delete_all_notifications(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    db.query(Notification).filter(
        Notification.user_id == current_user.user_id,
    ).delete()
    db.commit()
    return {"success": True}
