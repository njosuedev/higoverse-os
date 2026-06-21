"""
Subscription management endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth_bearer import decode_token
from app.db.session import get_db
from app.models.advisor import AISubscription, PLAN_LIMITS
from app.schemas.advisor import SubscriptionOut, UpgradeRequest
from app.services import subscription as sub_svc

router = APIRouter()


@router.get("/", response_model=SubscriptionOut)
def get_subscription(auth: dict = Depends(decode_token), db: Session = Depends(get_db)):
    user_id = auth["user_id"]
    sub = db.query(AISubscription).filter(AISubscription.user_id == user_id).first()
    if not sub:
        raise HTTPException(404, "No AI subscription found. Send your first chat message to start your free trial.")
    return SubscriptionOut(
        shop_id            = str(sub.shop_id),
        shop_name          = sub.shop_name,
        plan               = sub.plan,
        status             = sub.status,
        is_active          = sub.is_active,
        messages_used      = sub.messages_used,
        messages_limit     = sub.messages_limit,
        messages_remaining = sub.messages_remaining,
        trial_ends_at      = sub.trial_ends_at,
        period_start       = sub.period_start,
        period_end         = sub.period_end,
        created_at         = sub.created_at,
    )


@router.post("/upgrade")
def upgrade_subscription(
    body: UpgradeRequest,
    auth: dict    = Depends(decode_token),
    db:   Session = Depends(get_db),
):
    if body.plan not in PLAN_LIMITS or body.plan == "trial":
        raise HTTPException(400, "Invalid plan. Choose: basic, pro, or enterprise.")

    user_id = auth["user_id"]
    sub = db.query(AISubscription).filter(AISubscription.user_id == user_id).first()
    if not sub:
        raise HTTPException(404, "No subscription found. Chat first to initialise your account.")

    sub = sub_svc.upgrade_plan(db, sub, body.plan)
    plan_info = PLAN_LIMITS[sub.plan]
    return {
        "success": True,
        "message": f"Upgraded to {plan_info['label']} plan.",
        "plan":    sub.plan,
        "messages_limit": sub.messages_limit,
        "period_end": sub.period_end.isoformat() if sub.period_end else None,
    }


@router.get("/plans")
def list_plans():
    return {
        "success": True,
        "data": [
            {
                "id":            plan,
                "label":         info["label"],
                "messages":      info["messages"],
                "price_rwf":     info["price_rwf"],
                "price_monthly": f"{info['price_rwf']:,} RWF/month" if info["price_rwf"] > 0 else "Free",
            }
            for plan, info in PLAN_LIMITS.items()
        ],
    }
