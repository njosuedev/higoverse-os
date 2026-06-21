"""
Core AI Advisor endpoints — chat, conversations, history.
No subscription gate — free for all users.
"""
from __future__ import annotations
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_bearer import decode_token
from app.db.session import get_db
from app.models.advisor import AIConversation, AIMessage, AIUsageLog
from app.schemas.advisor import ChatRequest, ChatResponse
from app.services import data_aggregator, ai_service

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(
    body: ChatRequest,
    auth: dict    = Depends(decode_token),
    db:   Session = Depends(get_db),
):
    user_id = auth["user_id"]
    token   = auth["token"]

    # 1 ── Get shop info
    shop_info = await data_aggregator.get_shop_info(token)
    shop_id   = str(shop_info.get("id", ""))
    shop_name = shop_info.get("name", "Your Shop")

    if not shop_id:
        raise HTTPException(status_code=400, detail="Could not resolve shop for this user.")

    # 2 ── Get or create conversation
    if body.conversation_id:
        conv = db.query(AIConversation).filter(
            AIConversation.id      == body.conversation_id,
            AIConversation.shop_id == shop_id,
        ).first()
        if not conv:
            raise HTTPException(status_code=404, detail="Conversation not found")
    else:
        title = body.message[:60] + ("…" if len(body.message) > 60 else "")
        conv  = AIConversation(shop_id=UUID(shop_id), title=title)
        db.add(conv)
        db.commit()
        db.refresh(conv)

    # 3 ── Build history
    past_msgs = (
        db.query(AIMessage)
          .filter(AIMessage.conversation_id == conv.id)
          .order_by(AIMessage.created_at)
          .limit(20)
          .all()
    )
    history = [{"role": m.role, "content": m.content} for m in past_msgs]

    # 4 ── Gather shop context
    context = await data_aggregator.gather_context(token)

    # 5 ── Generate response
    try:
        reply, tok_in, tok_out, cost_usd, elapsed_ms = ai_service.generate_reply(
            user_message = body.message,
            context      = context,
            language     = body.language,
            history      = history,
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    # 6 ── Persist messages
    db.add_all([
        AIMessage(
            conversation_id = conv.id,
            shop_id         = UUID(shop_id),
            role            = "user",
            content         = body.message,
            language        = body.language,
        ),
        AIMessage(
            conversation_id = conv.id,
            shop_id         = UUID(shop_id),
            role            = "assistant",
            content         = reply,
            language        = body.language,
            tokens_input    = tok_in,
            tokens_output   = tok_out,
        ),
    ])
    db.add(AIUsageLog(
        shop_id       = UUID(shop_id),
        user_id       = UUID(user_id),
        tokens_input  = tok_in,
        tokens_output = tok_out,
        cost_usd      = cost_usd,
        response_ms   = elapsed_ms,
    ))
    db.commit()

    return ChatResponse(
        reply              = reply,
        conversation_id    = str(conv.id),
        message_id         = "",
        messages_used      = 0,
        messages_remaining = -1,
        language           = body.language,
    )


@router.get("/conversations")
def list_conversations(auth: dict = Depends(decode_token), db: Session = Depends(get_db)):
    from app.models.advisor import AIUsageLog
    user_id = auth["user_id"]
    logs = db.query(AIUsageLog).filter(AIUsageLog.user_id == user_id).first()
    shop_id = str(logs.shop_id) if logs else None
    if not shop_id:
        return {"success": True, "data": []}
    convs = (
        db.query(AIConversation)
          .filter(AIConversation.shop_id == shop_id)
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
    conv = db.query(AIConversation).filter(AIConversation.id == conv_id).first()
    if not conv:
        raise HTTPException(404, "Conversation not found")
    return {
        "success": True,
        "data": [
            {"id": str(m.id), "role": m.role, "content": m.content,
             "language": m.language, "created_at": m.created_at.isoformat()}
            for m in conv.messages
        ],
    }


@router.delete("/conversations/{conv_id}")
def delete_conversation(
    conv_id: str,
    auth:    dict    = Depends(decode_token),
    db:      Session = Depends(get_db),
):
    conv = db.query(AIConversation).filter(AIConversation.id == conv_id).first()
    if not conv:
        raise HTTPException(404, "Conversation not found")
    db.delete(conv)
    db.commit()
    return {"success": True}
