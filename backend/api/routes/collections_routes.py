"""14-day autonomous collections ladder."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth.deps import get_current_user
from db.prisma_client import prisma
from prisma.models import User
from services.audit_log import log_audit
from services.collection_ladder import list_campaigns, start_campaign

router = APIRouter()


@router.get("/customers")
async def list_customers_for_ladder(user: User = Depends(get_current_user)):
    rows = await prisma.customer.find_many(
        where={"user_id": user.id},
        order={"name": "asc"},
        include={"bill": True},
    )
    items = []
    for r in rows:
        bill_out = None
        b = getattr(r, "bill", None)
        if b is not None:
            bill_out = {
                "id": b.id,
                "bill_number": b.bill_number,
                "total_amount": float(b.total_amount),
                "source": b.source,
            }
        items.append(
            {
                "id": r.id,
                "name": r.name,
                "total_due": float(r.total_due),
                "phone": r.phone,
                "bill_id": r.bill_id,
                "bill": bill_out,
            }
        )
    return {"items": items}


class StartLadderBody(BaseModel):
    customer_id: int = Field(..., ge=1)


@router.post("/ladder/start")
async def post_start_ladder(body: StartLadderBody, user: User = Depends(get_current_user)):
    try:
        out = await start_campaign(user.id, body.customer_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e)) from e
    await log_audit(
        user_id=user.id,
        actor="user",
        action="collections.ladder.start",
        resource=f"customer:{body.customer_id}",
        metadata={"campaign_id": out.get("campaign_id")},
    )
    return out


@router.get("/ladder")
async def get_ladders(user: User = Depends(get_current_user)):
    return {"items": await list_campaigns(user.id)}
