"""
AI Advisor chat endpoint — DB-optional.
If DB is unavailable the service still works; history just won't persist.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.auth_bearer import decode_token
from app.services import data_aggregator, ai_service

router = APIRouter()


def _try_db():
    """Yield a DB session or None — never raises."""
    try:
        from app.db.session import SessionLocal
        if SessionLocal is None:
            yield None
            return
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()
    except Exception:
        yield None


@router.post("/chat")
async def chat(
    body: dict,
    auth: dict = Depends(decode_token),
):
    from uuid import UUID
    user_id  = auth["user_id"]
    token    = auth["token"]
    message  = (body.get("message") or "").strip()
    conv_id  = body.get("conversation_id")
    language = body.get("language", "en")

    if not message:
        return JSONResponse(status_code=400, content={"detail": "message is required"})

    # 1 ── Get shop info
    shop_info = await data_aggregator.get_shop_info(token)
    shop_id   = str(shop_info.get("id", ""))
    shop_name = shop_info.get("name", "Your Shop")

    if not shop_id:
        return JSONResponse(status_code=400, content={"detail": "Could not resolve shop for this user."})

    # 2 ── Load history from DB (optional)
    history      = []
    db_conv_id   = conv_id
    try:
        from app.db.session import SessionLocal
        from app.models.advisor import AIConversation, AIMessage, AIUsageLog
        if SessionLocal:
            db = SessionLocal()
            try:
                # Get or create conversation
                conv = None
                if conv_id:
                    conv = db.query(AIConversation).filter(
                        AIConversation.id      == conv_id,
                        AIConversation.shop_id == shop_id,
                    ).first()
                if not conv:
                    title = message[:60] + ("…" if len(message) > 60 else "")
                    conv  = AIConversation(shop_id=UUID(shop_id), title=title)
                    db.add(conv)
                    db.commit()
                    db.refresh(conv)
                db_conv_id = str(conv.id)

                past = (
                    db.query(AIMessage)
                      .filter(AIMessage.conversation_id == conv.id)
                      .order_by(AIMessage.created_at)
                      .limit(20).all()
                )
                history = [{"role": m.role, "content": m.content} for m in past]
            finally:
                db.close()
    except Exception:
        pass  # continue without DB

    # 3 ── Gather shop context
    context = await data_aggregator.gather_context(token)

    # 4 ── Generate response
    try:
        reply, tok_in, tok_out, cost_usd, elapsed_ms = ai_service.generate_reply(
            user_message = message,
            context      = context,
            language     = language,
            history      = history,
        )
    except Exception as exc:
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    # 5 ── Persist (optional)
    msg_id = ""
    try:
        from app.db.session import SessionLocal
        from app.models.advisor import AIConversation, AIMessage, AIUsageLog
        if SessionLocal and db_conv_id:
            db = SessionLocal()
            try:
                ai_msg = AIMessage(
                    conversation_id = UUID(db_conv_id),
                    shop_id         = UUID(shop_id),
                    role            = "user",
                    content         = message,
                    language        = language,
                )
                ai_reply = AIMessage(
                    conversation_id = UUID(db_conv_id),
                    shop_id         = UUID(shop_id),
                    role            = "assistant",
                    content         = reply,
                    language        = language,
                    tokens_input    = tok_in,
                    tokens_output   = tok_out,
                )
                db.add_all([ai_msg, ai_reply])
                db.add(AIUsageLog(
                    shop_id       = UUID(shop_id),
                    user_id       = UUID(user_id),
                    tokens_input  = tok_in,
                    tokens_output = tok_out,
                    cost_usd      = cost_usd,
                    response_ms   = elapsed_ms,
                ))
                db.commit()
                msg_id = str(ai_reply.id)
            finally:
                db.close()
    except Exception:
        pass  # reply already generated, just skip saving

    return {
        "reply":           reply,
        "conversation_id": db_conv_id or "session",
        "message_id":      msg_id,
        "language":        language,
    }


@router.get("/conversations")
def list_conversations(auth: dict = Depends(decode_token)):
    try:
        from app.db.session import SessionLocal
        from app.models.advisor import AIUsageLog, AIConversation
        if not SessionLocal:
            return {"success": True, "data": []}
        db = SessionLocal()
        try:
            log = db.query(AIUsageLog).filter(
                AIUsageLog.user_id == auth["user_id"]
            ).first()
            if not log:
                return {"success": True, "data": []}
            convs = (
                db.query(AIConversation)
                  .filter(AIConversation.shop_id == log.shop_id)
                  .order_by(AIConversation.updated_at.desc())
                  .limit(50).all()
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
        finally:
            db.close()
    except Exception:
        return {"success": True, "data": []}


@router.get("/conversations/{conv_id}/messages")
def get_messages(conv_id: str, auth: dict = Depends(decode_token)):
    try:
        from app.db.session import SessionLocal
        from app.models.advisor import AIConversation, AIMessage
        if not SessionLocal:
            return {"success": True, "data": []}
        db = SessionLocal()
        try:
            conv = db.query(AIConversation).filter(AIConversation.id == conv_id).first()
            if not conv:
                return {"success": True, "data": []}
            return {
                "success": True,
                "data": [
                    {"id": str(m.id), "role": m.role, "content": m.content,
                     "language": m.language, "created_at": m.created_at.isoformat()}
                    for m in conv.messages
                ],
            }
        finally:
            db.close()
    except Exception:
        return {"success": True, "data": []}


@router.delete("/conversations/{conv_id}")
def delete_conversation(conv_id: str, auth: dict = Depends(decode_token)):
    try:
        from app.db.session import SessionLocal
        from app.models.advisor import AIConversation
        if not SessionLocal:
            return {"success": True}
        db = SessionLocal()
        try:
            conv = db.query(AIConversation).filter(AIConversation.id == conv_id).first()
            if conv:
                db.delete(conv)
                db.commit()
        finally:
            db.close()
    except Exception:
        pass
    return {"success": True}
