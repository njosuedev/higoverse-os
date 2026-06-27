import asyncio
import json
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.auth import get_current_user, TokenData
from app.core.config import settings
from app.core.events import publish_sync, subscribe, unsubscribe
from app.db.session import get_db
from app.models.conversation import Conversation
from app.models.message import Message
from app.schemas.conversation import ConversationCreate, ConversationOut
from app.schemas.message import MessageCreate, MessageEdit, MessageOut, OfferAction

router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────────────────────

def _fmt_conv(c: Conversation, unread: int = 0) -> dict:
    return {
        "id":              str(c.id),
        "customer_id":     c.customer_id,
        "customer_name":   c.customer_name,
        "shop_id":         c.shop_id,
        "shop_name":       c.shop_name,
        "product_id":      c.product_id,
        "product_name":    c.product_name,
        "product_image":   c.product_image,
        "listed_price":    float(c.listed_price) if c.listed_price else None,
        "agreed_price":    float(c.agreed_price) if c.agreed_price else None,
        "status":          c.status,
        "unread_count":    unread,
        "last_message_at": c.last_message_at.isoformat() if c.last_message_at else None,
        "created_at":      c.created_at.isoformat() if c.created_at else None,
    }


def _fmt_msg(m: Message) -> dict:
    return {
        "id":              str(m.id),
        "conversation_id": str(m.conversation_id),
        "sender_id":       m.sender_id,
        "sender_name":     m.sender_name,
        "sender_type":     m.sender_type,
        "content":         m.content,
        "message_type":    m.message_type,
        "offer_price":     float(m.offer_price) if m.offer_price else None,
        "is_read":         m.is_read,
        "is_deleted":      bool(getattr(m, "is_deleted", False)),
        "edited_at":       m.edited_at.isoformat() if getattr(m, "edited_at", None) else None,
        "created_at":      m.created_at.isoformat() if m.created_at else None,
    }


def _push_notification(user_id: str, notif_type: str, title: str, body: str, data: dict):
    """Fire-and-forget notification push to notification-service."""
    if not settings.NOTIFICATION_SERVICE_URL:
        return
    try:
        httpx.post(
            f"{settings.NOTIFICATION_SERVICE_URL}/api/v1/internal/notify",
            json={"user_id": user_id, "type": notif_type, "title": title, "body": body, "data": data},
            headers={"X-Service-Key": settings.SERVICE_KEY},
            timeout=3,
        )
    except Exception:
        pass  # never block the message send on notification failure


def _sse_push(channel: str, conv: Conversation, msg: Message) -> None:
    """Push a new_message SSE event to a recipient's live connections."""
    publish_sync(channel, {
        "type":            "new_message",
        "conversation_id": str(conv.id),
        "message":         _fmt_msg(msg),
    })


# ── SSE stream ────────────────────────────────────────────────────────────────

@router.get("/stream")
async def stream_events(
    request: Request,
    current_user: TokenData = Depends(get_current_user),
):
    """
    Server-Sent Events endpoint. One persistent connection per browser tab.
    Receives new_message events in real time — no polling needed.
    """
    uid = current_user.user_id
    sid = current_user.shop_id
    channels = [uid] + ([sid] if sid else [])
    q = subscribe(channels)

    async def generator():
        try:
            yield f"data: {json.dumps({'type': 'connected'})}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(q.get(), timeout=25)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    # Keep-alive ping so proxies don't close idle connections
                    yield f"data: {json.dumps({'type': 'ping'})}\n\n"
        finally:
            unsubscribe(channels, q)

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "Connection":       "keep-alive",
            "X-Accel-Buffering": "no",  # disable nginx buffering
        },
    )


# ── Conversations ─────────────────────────────────────────────────────────────

@router.get("/conversations")
def list_conversations(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    uid = current_user.user_id
    sid = current_user.shop_id

    query = db.query(Conversation)
    if sid:
        query = query.filter(
            (Conversation.customer_id == uid) | (Conversation.shop_id == sid)
        )
    else:
        query = query.filter(Conversation.customer_id == uid)

    convs = query.order_by(Conversation.last_message_at.desc()).all()

    result = []
    for c in convs:
        if uid == c.customer_id:
            unread = db.query(func.count(Message.id)).filter(
                Message.conversation_id == c.id,
                Message.sender_type == "shop",
                Message.is_read == False,
            ).scalar() or 0
        else:
            unread = db.query(func.count(Message.id)).filter(
                Message.conversation_id == c.id,
                Message.sender_type == "customer",
                Message.is_read == False,
            ).scalar() or 0
        result.append(_fmt_conv(c, unread))

    return {"success": True, "data": result}


@router.post("/conversations")
def create_or_get_conversation(
    payload: ConversationCreate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    uid = current_user.user_id

    existing = db.query(Conversation).filter(
        Conversation.customer_id == uid,
        Conversation.shop_id == payload.shop_id,
        Conversation.product_id == payload.product_id,
        Conversation.status == "open",
    ).first()

    if existing:
        if payload.first_message:
            msg = _send_message_internal(db, existing, uid, "customer", payload.first_message, "text", None, payload.customer_name)
            db.commit()
            db.refresh(msg)
            _sse_push(existing.shop_id, existing, msg)
        return {"success": True, "data": _fmt_conv(existing)}

    conv = Conversation(
        customer_id=uid,
        customer_name=payload.customer_name,
        shop_id=payload.shop_id,
        shop_name=payload.shop_name,
        product_id=payload.product_id,
        product_name=payload.product_name,
        product_image=payload.product_image,
        listed_price=payload.listed_price,
    )
    db.add(conv)
    db.flush()

    msg = None
    if payload.first_message:
        msg = _send_message_internal(db, conv, uid, "customer", payload.first_message, "text", None, payload.customer_name)

    db.commit()
    db.refresh(conv)

    if msg:
        db.refresh(msg)
        _sse_push(conv.shop_id, conv, msg)

    return {"success": True, "data": _fmt_conv(conv)}


@router.get("/conversations/{conv_id}")
def get_conversation(
    conv_id: str,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    conv = _get_conv_or_403(conv_id, db, current_user)
    return {"success": True, "data": _fmt_conv(conv)}


@router.delete("/conversations/{conv_id}")
def close_conversation(
    conv_id: str,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    conv = _get_conv_or_403(conv_id, db, current_user)
    conv.status = "closed"
    db.commit()
    return {"success": True}


# ── Messages ──────────────────────────────────────────────────────────────────

@router.get("/conversations/{conv_id}/messages")
def list_messages(
    conv_id: str,
    after: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    uid = current_user.user_id
    conv = _get_conv_or_403(conv_id, db, current_user)

    q = db.query(Message).filter(Message.conversation_id == conv.id)
    if after:
        try:
            ts = datetime.fromisoformat(after)
            q = q.filter(Message.created_at > ts)
        except ValueError:
            pass

    msgs = q.order_by(Message.created_at.asc()).all()

    is_customer = uid == conv.customer_id
    incoming_type = "shop" if is_customer else "customer"
    db.query(Message).filter(
        Message.conversation_id == conv.id,
        Message.sender_type == incoming_type,
        Message.is_read == False,
    ).update({"is_read": True})
    db.commit()

    return {"success": True, "data": [_fmt_msg(m) for m in msgs]}


@router.post("/conversations/{conv_id}/messages")
def send_message(
    conv_id: str,
    payload: MessageCreate,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    uid = current_user.user_id
    sid = current_user.shop_id
    conv = _get_conv_or_403(conv_id, db, current_user)

    if conv.status not in ("open",):
        raise HTTPException(status_code=400, detail="Conversation is closed")

    is_customer = uid == conv.customer_id
    sender_type = "customer" if is_customer else "shop"

    msg = _send_message_internal(
        db, conv, uid, sender_type,
        payload.content, payload.message_type,
        payload.offer_price, payload.sender_name,
    )
    db.commit()
    db.refresh(msg)

    if is_customer:
        recipient_id = conv.shop_id
        notif_title  = f"New message from {conv.customer_name or 'a customer'}"
    else:
        recipient_id = conv.customer_id
        notif_title  = f"New message from {conv.shop_name or 'a shop'}"

    notif_type = "offer_received" if payload.message_type == "offer" else "new_message"
    body_text  = payload.content if payload.message_type != "offer" else f"Offer: FRW {int(payload.offer_price or 0):,}"

    _push_notification(recipient_id, notif_type, notif_title, body_text, {
        "conversation_id": str(conv.id),
        "product_name":    conv.product_name,
        "shop_name":       conv.shop_name,
    })

    # SSE push — delivers to recipient instantly if they have the messages tab open
    _sse_push(recipient_id, conv, msg)

    return {"success": True, "data": _fmt_msg(msg)}


@router.patch("/conversations/{conv_id}/messages/{msg_id}")
def edit_message(
    conv_id: str,
    msg_id:  str,
    payload: MessageEdit,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    uid  = current_user.user_id
    conv = _get_conv_or_403(conv_id, db, current_user)
    msg  = db.query(Message).filter(
        Message.id == msg_id, Message.conversation_id == conv.id
    ).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.sender_id != uid:
        raise HTTPException(status_code=403, detail="Only the sender can edit this message")
    if msg.message_type != "text":
        raise HTTPException(status_code=400, detail="Only text messages can be edited")
    if getattr(msg, "is_deleted", False):
        raise HTTPException(status_code=400, detail="Cannot edit a deleted message")

    msg.content   = payload.content.strip()
    msg.edited_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(msg)

    event = {"type": "message_updated", "conversation_id": str(conv.id), "message": _fmt_msg(msg)}
    recipient = conv.customer_id if uid != conv.customer_id else conv.shop_id
    publish_sync(uid, event)
    publish_sync(recipient, event)

    return {"success": True, "data": _fmt_msg(msg)}


@router.delete("/conversations/{conv_id}/messages/{msg_id}")
def delete_message(
    conv_id: str,
    msg_id:  str,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    uid  = current_user.user_id
    conv = _get_conv_or_403(conv_id, db, current_user)
    msg  = db.query(Message).filter(
        Message.id == msg_id, Message.conversation_id == conv.id
    ).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.sender_id != uid:
        raise HTTPException(status_code=403, detail="Only the sender can delete this message")

    msg.is_deleted = True
    msg.content    = "This message was deleted"
    db.commit()
    db.refresh(msg)

    event = {"type": "message_deleted", "conversation_id": str(conv.id), "message": _fmt_msg(msg)}
    recipient = conv.customer_id if uid != conv.customer_id else conv.shop_id
    publish_sync(uid, event)
    publish_sync(recipient, event)

    return {"success": True, "data": _fmt_msg(msg)}


@router.post("/conversations/{conv_id}/offers/{msg_id}")
def respond_to_offer(
    conv_id: str,
    msg_id: str,
    payload: OfferAction,
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    uid = current_user.user_id
    sid = current_user.shop_id
    conv = _get_conv_or_403(conv_id, db, current_user)

    if conv.status != "open":
        raise HTTPException(status_code=400, detail="Conversation is closed")

    is_shop = sid and conv.shop_id == sid
    if not is_shop:
        raise HTTPException(status_code=403, detail="Only the shop can respond to offers")

    offer_msg = db.query(Message).filter(
        Message.id == msg_id,
        Message.conversation_id == conv.id,
        Message.message_type == "offer",
    ).first()
    if not offer_msg:
        raise HTTPException(status_code=404, detail="Offer not found")

    if payload.action == "accept":
        conv.status       = "accepted"
        conv.agreed_price = offer_msg.offer_price
        msg_type          = "offer_accepted"
        content           = f"Offer of FRW {int(offer_msg.offer_price or 0):,} accepted! The deal is confirmed."
        notif_type        = "offer_accepted"
        notif_title       = f"{conv.shop_name or 'Shop'} accepted your offer!"
    elif payload.action == "reject":
        msg_type    = "offer_rejected"
        content     = f"Offer of FRW {int(offer_msg.offer_price or 0):,} was declined."
        notif_type  = "offer_rejected"
        notif_title = f"{conv.shop_name or 'Shop'} declined your offer"
    else:
        raise HTTPException(status_code=400, detail="Action must be accept or reject")

    sys_msg = _send_message_internal(db, conv, uid, "shop", content, msg_type, offer_msg.offer_price)
    db.commit()
    db.refresh(sys_msg)

    _push_notification(conv.customer_id, notif_type, notif_title, content, {
        "conversation_id": str(conv.id),
        "product_name":    conv.product_name,
        "shop_name":       conv.shop_name,
        "agreed_price":    float(offer_msg.offer_price or 0),
    })

    # Notify the customer via SSE — they see the offer response instantly
    _sse_push(conv.customer_id, conv, sys_msg)

    return {"success": True, "data": _fmt_msg(sys_msg)}


@router.get("/unread-count")
def unread_count(
    db: Session = Depends(get_db),
    current_user: TokenData = Depends(get_current_user),
):
    uid = current_user.user_id
    sid = current_user.shop_id

    customer_unread = db.query(func.count(Message.id)).join(
        Conversation, Message.conversation_id == Conversation.id
    ).filter(
        Conversation.customer_id == uid,
        Message.sender_type == "shop",
        Message.is_read == False,
    ).scalar() or 0

    shop_unread = 0
    if sid:
        shop_unread = db.query(func.count(Message.id)).join(
            Conversation, Message.conversation_id == Conversation.id
        ).filter(
            Conversation.shop_id == sid,
            Message.sender_type == "customer",
            Message.is_read == False,
        ).scalar() or 0

    return {"success": True, "data": {"count": customer_unread + shop_unread}}


# ── Internal helpers ──────────────────────────────────────────────────────────

def _get_conv_or_403(conv_id: str, db: Session, current_user: TokenData) -> Conversation:
    conv = db.query(Conversation).filter(Conversation.id == conv_id).first()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    uid = current_user.user_id
    sid = current_user.shop_id
    if uid != conv.customer_id and (not sid or sid != conv.shop_id):
        raise HTTPException(status_code=403, detail="Access denied")
    return conv


def _send_message_internal(
    db: Session,
    conv: Conversation,
    sender_id: str,
    sender_type: str,
    content: str,
    message_type: str,
    offer_price,
    sender_name: Optional[str] = None,
) -> Message:
    msg = Message(
        conversation_id=conv.id,
        sender_id=sender_id,
        sender_name=sender_name,
        sender_type=sender_type,
        content=content,
        message_type=message_type,
        offer_price=offer_price,
    )
    db.add(msg)
    conv.last_message_at = datetime.now(timezone.utc)
    return msg
