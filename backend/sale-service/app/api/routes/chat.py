"""Messages between the people of one business (owner and up to three
employees), end-to-end encrypted: this service only stores and relays
ciphertexts and public keys (see app/models/chat.py).

PUT  /chat/devices                     register this device's public key
GET  /chat/devices?users=a,b           devices (public keys) of team members
POST /chat/messages                    send (ciphertext + key per device)
GET  /chat/messages?with=&device_id=   a conversation, newest first
GET  /chat/conversations?device_id=    last message and unread count per person
POST /chat/read                        mark a conversation read
POST /chat/attachments                 store an encrypted photo  → its id
GET  /chat/attachments/{id}            the encrypted photo (same business only)

Live: "chat.message" and "chat.read" go only to the two people concerned.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.core.events import emit
from app.core.security import get_current_user
from app.db.database import get_db
from app.models.chat import ChatAttachment, ChatDevice, ChatMessage, ChatMessageKey

router = APIRouter(prefix="/chat", tags=["Messages"])

_MAX_TEXT = 24_000   # base64 of a few thousand characters of text
_MAX_KEYS = 24       # devices a message can be wrapped for
_MAX_FILE = 4_000_000  # base64 of an encrypted photo (~3 MB; phones send ~300 KB)


class DeviceIn(BaseModel):
    id: str = Field(..., min_length=8, max_length=64)
    public_key: str = Field(..., min_length=40, max_length=64)
    label: str | None = Field(None, max_length=80)


class WrappedKey(BaseModel):
    device_id: str = Field(..., max_length=64)
    wrapped: str = Field(..., max_length=128)
    nonce: str = Field(..., max_length=32)


class MessageIn(BaseModel):
    recipient_id: str = Field(..., max_length=64)
    device_id: str = Field(..., max_length=64)
    ciphertext: str = Field(..., max_length=_MAX_TEXT)
    nonce: str = Field(..., max_length=32)
    keys: list[WrappedKey] = Field(..., min_length=1, max_length=_MAX_KEYS)


class AttachmentIn(BaseModel):
    data: str = Field(..., min_length=16, max_length=_MAX_FILE)


class ReadIn(BaseModel):
    with_user: str = Field(..., alias="with", max_length=64)


def _shop(user: dict) -> str:
    if not user.get("shop_id"):
        raise HTTPException(status_code=400, detail="This account has no business.")
    return str(user["shop_id"])


def _iso(d):
    return d.isoformat() if d else None


def _fmt(m: ChatMessage, key, sender_key: str | None) -> dict:
    """[key]: this device's wrapped key (a ChatMessageKey or WrappedKey), or None."""
    return {
        "id": m.id,
        "sender_id": m.sender_id,
        "recipient_id": m.recipient_id,
        "sender_device_id": m.sender_device_id,
        "sender_public_key": sender_key,
        "ciphertext": m.ciphertext,
        "nonce": m.nonce,
        "created_at": _iso(m.created_at),
        "read_at": _iso(m.read_at),
        # Null when the message was sent before this device was set up.
        "key": {"wrapped": key.wrapped, "nonce": key.nonce} if key else None,
    }


def _with_keys(db: Session, msgs: list[ChatMessage], device_id: str) -> list[dict]:
    if not msgs:
        return []
    ids = [m.id for m in msgs]
    keys = {k.message_id: k for k in db.query(ChatMessageKey).filter(
        ChatMessageKey.message_id.in_(ids), ChatMessageKey.device_id == device_id)}
    devs = {d.id: d.public_key for d in db.query(ChatDevice).filter(
        ChatDevice.id.in_({m.sender_device_id for m in msgs}))}
    return [_fmt(m, keys.get(m.id), devs.get(m.sender_device_id)) for m in msgs]


def _pair(shop: str, a: str, b: str):
    return and_(ChatMessage.shop_id == shop, or_(
        and_(ChatMessage.sender_id == a, ChatMessage.recipient_id == b),
        and_(ChatMessage.sender_id == b, ChatMessage.recipient_id == a),
    ))


@router.put("/devices")
def register_device(payload: DeviceIn, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    shop, me = _shop(user), str(user["user_id"])
    d = db.query(ChatDevice).filter(ChatDevice.id == payload.id).first()
    if d and (d.user_id != me or d.shop_id != shop):
        raise HTTPException(status_code=409, detail="This device belongs to another account.")
    if not d:
        d = ChatDevice(id=payload.id, shop_id=shop, user_id=me, public_key=payload.public_key)
        db.add(d)
    d.public_key = payload.public_key
    d.label = payload.label
    d.last_seen_at = datetime.now(timezone.utc)
    db.commit()
    return {"success": True, "data": {"id": d.id}}


@router.get("/devices")
def list_devices(users: str = Query(..., max_length=2000), db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    shop = _shop(user)
    ids = [u for u in dict.fromkeys(x.strip() for x in users.split(",")) if u][:10]
    rows = db.query(ChatDevice).filter(ChatDevice.shop_id == shop, ChatDevice.user_id.in_(ids)).all()
    return {"success": True, "data": [
        {"id": d.id, "user_id": d.user_id, "public_key": d.public_key, "label": d.label} for d in rows
    ]}


@router.post("/messages")
def send_message(payload: MessageIn, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    shop, me = _shop(user), str(user["user_id"])
    if payload.recipient_id == me:
        raise HTTPException(status_code=400, detail="Choose someone to write to.")
    mine = db.query(ChatDevice).filter(ChatDevice.id == payload.device_id, ChatDevice.user_id == me,
                                       ChatDevice.shop_id == shop).first()
    if not mine:
        raise HTTPException(status_code=400, detail="This device is not set up for messages yet.")
    allowed = {d.id: d.user_id for d in db.query(ChatDevice).filter(
        ChatDevice.shop_id == shop, ChatDevice.user_id.in_([me, payload.recipient_id]))}
    if payload.recipient_id not in allowed.values():
        raise HTTPException(status_code=400, detail="This person hasn't opened Messages yet.")
    keys = {k.device_id: k for k in payload.keys}
    if any(dev not in allowed for dev in keys):
        raise HTTPException(status_code=400, detail="A key is for a device outside this conversation.")
    if not any(allowed[dev] == payload.recipient_id for dev in keys):
        raise HTTPException(status_code=400, detail="The message has no key for the recipient.")

    m = ChatMessage(shop_id=shop, sender_id=me, sender_device_id=mine.id, recipient_id=payload.recipient_id,
                    ciphertext=payload.ciphertext, nonce=payload.nonce)
    db.add(m)
    db.flush()
    for k in keys.values():
        db.add(ChatMessageKey(message_id=m.id, device_id=k.device_id, wrapped=k.wrapped, nonce=k.nonce))
    db.flush()
    db.refresh(m)
    # Small enough to travel live with every device's key; else the apps fetch it.
    emit(db, user, "chat.message", {
        **_fmt(m, None, mine.public_key),
        "keys": {k.device_id: {"wrapped": k.wrapped, "nonce": k.nonce} for k in keys.values()},
    }, to=[me, payload.recipient_id])
    db.commit()
    return {"success": True, "data": _fmt(m, keys.get(payload.device_id), mine.public_key)}


@router.get("/messages")
def conversation(
    with_user: str = Query(..., alias="with", max_length=64),
    device_id: str = Query(..., max_length=64),
    before: str | None = Query(None, max_length=40),
    limit: int = Query(40, ge=1, le=100),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user),
):
    shop, me = _shop(user), str(user["user_id"])
    q = db.query(ChatMessage).filter(_pair(shop, me, with_user))
    if before:
        try:
            q = q.filter(ChatMessage.created_at < datetime.fromisoformat(before))
        except ValueError:
            raise HTTPException(status_code=422, detail="before must be an ISO date")
    msgs = q.order_by(ChatMessage.created_at.desc()).limit(limit).all()
    return {"success": True, "data": _with_keys(db, msgs, device_id)}


@router.get("/conversations")
def conversations(device_id: str = Query(..., max_length=64), db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    shop, me = _shop(user), str(user["user_id"])
    recent = (db.query(ChatMessage)
              .filter(ChatMessage.shop_id == shop, or_(ChatMessage.sender_id == me, ChatMessage.recipient_id == me))
              .order_by(ChatMessage.created_at.desc()).limit(500).all())
    last: dict[str, ChatMessage] = {}
    unread: dict[str, int] = {}
    for m in recent:
        other = m.recipient_id if m.sender_id == me else m.sender_id
        last.setdefault(other, m)
        if m.recipient_id == me and m.read_at is None:
            unread[other] = unread.get(other, 0) + 1
    msgs = _with_keys(db, list(last.values()), device_id)
    return {"success": True, "data": [
        {"user_id": (x["recipient_id"] if x["sender_id"] == me else x["sender_id"]),
         "last": x, "unread": unread.get(x["recipient_id"] if x["sender_id"] == me else x["sender_id"], 0)}
        for x in msgs
    ]}


@router.post("/read")
def mark_read(payload: ReadIn, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    shop, me = _shop(user), str(user["user_id"])
    now = datetime.now(timezone.utc)
    n = (db.query(ChatMessage)
         .filter(ChatMessage.shop_id == shop, ChatMessage.sender_id == payload.with_user,
                 ChatMessage.recipient_id == me, ChatMessage.read_at.is_(None))
         .update({ChatMessage.read_at: now}, synchronize_session=False))
    if n:
        emit(db, user, "chat.read", {"by": me, "with": payload.with_user, "at": now.isoformat()}, to=[me, payload.with_user])
    db.commit()
    return {"success": True, "data": {"read": n}}


@router.post("/attachments")
def upload_attachment(payload: AttachmentIn, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    shop, me = _shop(user), str(user["user_id"])
    a = ChatAttachment(shop_id=shop, uploader_id=me, data=payload.data)
    db.add(a)
    db.commit()
    return {"success": True, "data": {"id": a.id}}


@router.get("/attachments/{attachment_id}")
def get_attachment(attachment_id: str, db: Session = Depends(get_db), user: dict = Depends(get_current_user)):
    a = db.query(ChatAttachment).filter(ChatAttachment.id == attachment_id, ChatAttachment.shop_id == _shop(user)).first()
    if not a:
        raise HTTPException(status_code=404, detail="Photo not found.")
    return {"success": True, "data": {"id": a.id, "data": a.data}}
