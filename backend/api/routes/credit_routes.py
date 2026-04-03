"""Lender-facing credit score API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from auth.deps import get_current_user
from db.prisma_client import prisma
from prisma.models import User
from services.audit_log import log_audit
from services.credit_score import compute_and_persist_credit_score, latest_credit_score

router = APIRouter()


@router.get("/score")
async def get_credit_score(
    user: User = Depends(get_current_user),
    refresh: bool = Query(False, description="Recompute from live data and persist a new snapshot"),
):
    if refresh:
        out = await compute_and_persist_credit_score(user.id)
        await log_audit(
            user_id=user.id,
            actor="user",
            action="credit_score.refresh",
            resource="credit_score",
            metadata={"score": out.get("score")},
        )
        return out
    existing = await latest_credit_score(user.id)
    if existing:
        return {**existing, "cached": True}
    out = await compute_and_persist_credit_score(user.id)
    return {**out, "cached": False}


@router.get("/history")
async def credit_history(user: User = Depends(get_current_user), limit: int = Query(10, ge=1, le=50)):
    rows = await prisma.creditscoresnapshot.find_many(
        where={"user_id": user.id},
        order={"created_at": "desc"},
        take=limit,
    )
    return {
        "items": [
            {
                "score": r.score,
                "band": r.band,
                "factors": r.factors,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    }
