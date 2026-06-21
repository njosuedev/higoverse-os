"""
Subscription management — creates trial on first use, validates access.
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.advisor import AISubscription, PLAN_LIMITS


TRIAL_DAYS = 14


def get_or_create(db: Session, shop_id: str, user_id: str, shop_name: str) -> AISubscription:
    sub = db.query(AISubscription).filter(AISubscription.shop_id == shop_id).first()
    if sub:
        if sub.shop_name != shop_name:
            sub.shop_name = shop_name
            db.commit()
        return sub

    # First time — create 14-day trial
    now = datetime.now(timezone.utc)
    sub = AISubscription(
        shop_id        = UUID(shop_id),
        user_id        = UUID(user_id),
        shop_name      = shop_name,
        plan           = "trial",
        status         = "trial",
        trial_ends_at  = now + timedelta(days=TRIAL_DAYS),
        messages_limit = PLAN_LIMITS["trial"]["messages"],
        messages_used  = 0,
    )
    db.add(sub)
    db.commit()
    db.refresh(sub)
    return sub


def check_access(sub: AISubscription) -> tuple[bool, str]:
    """Returns (allowed, reason)."""
    if not sub.is_active:
        if sub.status == "trial":
            return False, "Your 14-day free trial has ended. Upgrade to continue using the AI Advisor."
        if sub.status == "cancelled":
            return False, "Your subscription has been cancelled. Subscribe to regain access."
        return False, "Your subscription is not active. Please renew to continue."

    if sub.messages_limit != -1 and sub.messages_used >= sub.messages_limit:
        return False, f"You have used all {sub.messages_limit} messages in your current plan. Upgrade to continue."

    return True, "ok"


def increment_usage(db: Session, sub: AISubscription) -> None:
    sub.messages_used += 1
    db.commit()


def upgrade_plan(db: Session, sub: AISubscription, plan: str) -> AISubscription:
    if plan not in PLAN_LIMITS:
        raise ValueError(f"Unknown plan: {plan}")

    now = datetime.now(timezone.utc)
    sub.plan           = plan
    sub.status         = "active"
    sub.period_start   = now
    sub.period_end     = now + timedelta(days=30)
    sub.messages_limit = PLAN_LIMITS[plan]["messages"]
    sub.messages_used  = 0  # reset usage on new period
    db.commit()
    db.refresh(sub)
    return sub
