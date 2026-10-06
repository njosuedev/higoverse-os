"""Messages between the people of one business, end-to-end encrypted.

The server never sees a message: each phone, browser or desktop app
("device") makes its own X25519 key pair and keeps the private half. A
message is encrypted once on the sender's device with a fresh random key
(AES-256-GCM); that key is then wrapped for every device of the recipient
and of the sender (so it reads on all of them), and only ciphertexts are
stored here. See apps/mobile/lib/src/chat/crypto.dart and
apps/web/lib/chat-crypto.ts.
"""
import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.sql import func

from app.db.database import Base


class ChatDevice(Base):
    __tablename__ = "chat_devices"

    id = Column(String, primary_key=True)                 # made by the device
    shop_id = Column(String, nullable=False, index=True)
    user_id = Column(String, nullable=False, index=True)
    public_key = Column(String(64), nullable=False)       # X25519, base64
    label = Column(String(80), nullable=True)             # "Android", "Windows"…
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_seen_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    shop_id = Column(String, nullable=False)
    sender_id = Column(String, nullable=False)
    sender_device_id = Column(String, nullable=False)
    recipient_id = Column(String, nullable=False)
    ciphertext = Column(Text, nullable=False)              # base64(AES-GCM text + tag)
    nonce = Column(String(32), nullable=False)             # base64, 12 random bytes
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    read_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_chat_pair_time", "shop_id", "sender_id", "recipient_id", "created_at"),
    )


class ChatMessageKey(Base):
    """The message's key, wrapped for one device."""
    __tablename__ = "chat_message_keys"

    message_id = Column(String, ForeignKey("chat_messages.id", ondelete="CASCADE"), primary_key=True)
    device_id = Column(String, primary_key=True)
    wrapped = Column(String(128), nullable=False)          # base64(AES-GCM key + tag)
    nonce = Column(String(32), nullable=False)
