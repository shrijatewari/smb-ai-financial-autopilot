"""Subscription, referrals, benchmarks, audit (user-scoped)."""

from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from auth.deps import get_current_user
from db.prisma_client import prisma
from prisma.models import User
from services.audit_log import log_audit
from services.benchmark_service import benchmarks_for_industry, refresh_benchmark_aggregates
from services.referral_codes import ensure_referral_code

router = APIRouter()


class SubscriptionBody(BaseModel):
    tier: str = Field(..., description="free | pro | enterprise")


@router.get("/summary")
async def growth_summary(user: User = Depends(get_current_user)):
    code = await ensure_referral_code(user.id)
    ref_count = await prisma.user.count(where={"referred_by_user_id": user.id})
    bp = await prisma.businessprofile.find_unique(where={"user_id": user.id})
    industry = bp.business_type if bp else None
    return {
        "subscription_tier": getattr(user, "subscription_tier", None) or "free",
        "referral_code": code,
        "referrals_count": ref_count,
        "industry_key": industry,
        "referred_by_user_id": getattr(user, "referred_by_user_id", None),
    }


@router.post("/subscription")
async def set_subscription_tier(body: SubscriptionBody, request: Request, user: User = Depends(get_current_user)):
    allowed = (os.environ.get("GROWTH_ALLOW_TIER_OVERRIDE") or "true").strip().lower() in ("1", "true", "yes")
    if not allowed:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tier changes are billing-controlled.")
    t = body.tier.strip().lower()
    if t not in ("free", "pro", "enterprise"):
        raise HTTPException(status_code=400, detail="tier must be free, pro, or enterprise")
    await prisma.user.update(where={"id": user.id}, data={"subscription_tier": t})
    client_host = request.client.host if request.client else None
    await log_audit(
        user_id=user.id,
        actor="user",
        action="subscription.set_tier",
        resource="subscription",
        metadata={"tier": t},
        ip=client_host,
    )
    return {"subscription_tier": t}


@router.get("/benchmarks")
async def growth_benchmarks(user: User = Depends(get_current_user)):
    bp = await prisma.businessprofile.find_unique(where={"user_id": user.id})
    industry = bp.business_type if bp else None
    rows = await benchmarks_for_industry(industry)
    return {"industry_key": industry, "items": rows}


@router.post("/benchmarks/refresh")
async def post_benchmarks_refresh(user: User = Depends(get_current_user)):
    """Recompute aggregates (normally cron)."""
    out = await refresh_benchmark_aggregates()
    await log_audit(
        user_id=user.id,
        actor="user",
        action="benchmarks.refresh",
        resource="benchmark_aggregate",
        metadata=out,
    )
    return out


@router.get("/audit")
async def list_my_audit_logs(user: User = Depends(get_current_user), limit: int = 50):
    rows = await prisma.auditlog.find_many(
        where={"user_id": user.id},
        order={"created_at": "desc"},
        take=min(limit, 100),
    )
    return {
        "items": [
            {
                "actor": r.actor,
                "action": r.action,
                "resource": r.resource,
                "metadata": r.metadata,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }
