"""
Core AI Advisor endpoints — chat, conversations, history.
"""
from __future__ import annotations
import asyncio
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_bearer import decode_token
from app.db.session import get_db
from app.models.advisor import AIConversation, AIMessage, AIUsageLog
from app.schemas.advisor import ChatRequest, ChatResponse
from app.services import data_aggregator, ai_service, subscription as sub_svc

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(
    body:       ChatRequest,
    auth:       dict = Depends(decode_token),
    db:         Session = Depends(get_db),
):
    user_id = auth["user_id"]
    token   = auth["token"]

    # 1 ── Get shop info
    shop_info  = await data_aggregator.get_shop_info(token)
    shop_id    = str(shop_info.get("id", ""))
    shop_name  = shop_info.get("name", "Your Shop")

    if not shop_id:
        raise HTTPException(status_code=400, detail="Could not resolve shop for this user.")

    # 2 ── Subscription gate
    sub = sub_svc.get_or_create(db, shop_id, user_id, shop_name)
    allowed, reason = sub_svc.check_access(sub)
    if not allowed:
        raise HTTPException(status_code=402, detail=reason)

    # 3 ── Get or create conversation
    if body.conversation_id:
        conv = db.query(AIConversation).filter(
            AIConversation.id      == body.conversation_id,
            AIConversation.shop_id == shop_id,
        ).first()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
    else:
        # Auto-title from first message (truncated)
        title = body.message[:60] + ("…" if len(body.message) > 60 else "")
        conv  = AIConversation(shop_id=UUID(shop_id), title=title)
        db.add(conv)
        db.commit()
        db.refresh(conv)

    # 4 ── Build history for Claude
    past_msgs = (
        db.query(AIMessage)
          .filter(AIMessage.conversation_id == conv.id)
          .order_by(AIMessage.created_at)
          .limit(20)
          .all()
    )
    history = [{"role": m.role, "content": m.content} for m in past_msgs]

    # 5 ── Gather shop context
    context = await data_aggregator.gather_context(token)

    # 6 ── Generate standalone response (no external AI API)
    try:
        reply, tok_in, tok_out, cost_usd, elapsed_ms = ai_service.generate_reply(
            user_message = body.message,
            context      = context,
            language     = body.language,
            history      = history,
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    # 7 ── Persist messages
    user_msg = AIMessage(
        conversation_id = conv.id,
        shop_id         = UUID(shop_id),
        role            = "user",
        content         = body.message,
        language        = body.language,
    )
    ai_msg = AIMessage(
        conversation_id = conv.id,
        shop_id         = UUID(shop_id),
        role            = "assistant",
        content         = reply,
        language        = body.language,
        tokens_input    = tok_in,
        tokens_output   = tok_out,
    )
    db.add_all([user_msg, ai_msg])

    # 8 ── Usage log
    log = AIUsageLog(
        shop_id      = UUID(shop_id),
        user_id      = UUID(user_id),
        tokens_input = tok_in,
        tokens_output= tok_out,
        cost_usd     = cost_usd,
        response_ms  = elapsed_ms,
    )
    db.add(log)

    # 9 ── Increment usage counter
    sub_svc.increment_usage(db, sub)
    db.commit()

    return ChatResponse(
        reply               = reply,
        conversation_id     = str(conv.id),
        message_id          = str(ai_msg.id),
        messages_used       = sub.messages_used,
        messages_remaining  = sub.messages_remaining,
        language            = body.language,
    )


@router.get("/conversations")
def list_conversations(auth: dict = Depends(decode_token), db: Session = Depends(get_db)):
    """List all conversations for this shop (resolved from token via shop_id lookup is skipped
    for speed — we use the shop_id cached in AI subscription)."""
    user_id = auth["user_id"]
    sub = db.query(__import__("app.models.advisor", fromlist=["AISubscription"])
                   .AISubscription).filter_by(user_id=user_id).first()
    if not sub:
        return {"success": True, "data": []}

    convs = (
        db.query(AIConversation)
          .filter(AIConversation.shop_id == sub.shop_id)
          .order_by(AIConversation.updated_at.desc())
          .limit(50)
          .all()
    )
    return {
        "success": True,
        "data": [
            {"id": str(c.id), "title": c.title,
             "created_at": c.created_at.isoformat(),
             "updated_at": c.updated_at.isoformat()}
            for c in convs
        ],
    }


@router.get("/conversations/{conv_id}/messages")
def get_messages(
    conv_id: str,
    auth:    dict    = Depends(decode_token),
    db:      Session = Depends(get_db),
):
    user_id = auth["user_id"]
    sub = db.query(__import__("app.models.advisor", fromlist=["AISubscription"])
                   .AISubscription).filter_by(user_id=user_id).first()
    if not sub:
        raise HTTPException(404, "Subscription not found")

    conv = db.query(AIConversation).filter(
        AIConversation.id      == conv_id,
        AIConversation.shop_id == sub.shop_id,
    ).first()
    if not conv:
        raise HTTPException(404, "Conversation not found")

    msgs = conv.messages
    return {
        "success": True,
        "data": [
            {"id": str(m.id), "role": m.role, "content": m.content,
             "language": m.language, "created_at": m.created_at.isoformat()}
            for m in msgs
        ],
    }


@router.delete("/conversations/{conv_id}")
def delete_conversation(
    conv_id: str,
    auth:    dict    = Depends(decode_token),
    db:      Session = Depends(get_db),
):
    user_id = auth["user_id"]
    sub = db.query(__import__("app.models.advisor", fromlist=["AISubscription"])
                   .AISubscription).filter_by(user_id=user_id).first()
    if not sub:
        raise HTTPException(404, "Subscription not found")

    conv = db.query(AIConversation).filter(
        AIConversation.id      == conv_id,
        AIConversation.shop_id == sub.shop_id,
    ).first()
    if not conv:
        raise HTTPException(404, "Conversation not found")

    db.delete(conv)
    db.commit()
    return {"success": True}
