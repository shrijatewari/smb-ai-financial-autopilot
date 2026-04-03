"""Per-user notification / outbound activity log (WhatsApp brief, etc.)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from auth.deps import get_current_user
from db.prisma_client import prisma
from prisma.models import User

router = APIRouter()


@router.get("")
async def list_notifications(
    user: User = Depends(get_current_user),
    limit: int = Query(50, ge=1, le=100),
):
    """
    Recent `NotificationLog` rows for the signed-in user (e.g. morning briefing send attempts).
    """
    rows = await prisma.notificationlog.find_many(
        where={"user_id": user.id},
        order={"created_at": "desc"},
        take=limit,
    )
    items = []
    for r in rows:
        meta = r.metadata if isinstance(r.metadata, dict) else {}
        items.append(
            {
                "id": r.id,
                "channel": r.channel,
                "kind": r.kind,
                "status": r.status,
                "detail": (r.detail or "")[:500] if r.detail else None,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "mock": bool(meta.get("mock")),
            }
        )
    return {"count": len(items), "items": items}
