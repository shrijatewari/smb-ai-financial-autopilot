"""
14-step autonomous collections ladder – one touch per day, logged to NotificationLog.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any

from db.prisma_client import prisma
from prisma.fields import Json


MAX_STEP = 13  # 0..13 = 14 touches


async def start_campaign(user_id: int, customer_id: int) -> dict[str, Any]:
    cust = await prisma.customer.find_first(where={"id": customer_id, "user_id": user_id})
    if cust is None:
        raise ValueError("customer not found")
    existing = await prisma.collectioncampaign.find_first(
        where={
            "user_id": user_id,
            "customer_id": customer_id,
            "status": "active",
        }
    )
    if existing:
        return {
            "campaign_id": existing.id,
            "status": existing.status,
            "step_index": existing.step_index,
            "next_run_at": existing.next_run_at.isoformat() if existing.next_run_at else None,
            "message": "Campaign already active for this customer.",
        }
    now = datetime.now(timezone.utc)
    camp = await prisma.collectioncampaign.create(
        data={
            "user_id": user_id,
            "customer_id": customer_id,
            "step_index": 0,
            "status": "active",
            "next_run_at": now,
            "metadata": Json({"ladder": "14d", "version": 1}),
        }
    )
    return {
        "campaign_id": camp.id,
        "status": camp.status,
        "step_index": camp.step_index,
        "next_run_at": camp.next_run_at.isoformat() if camp.next_run_at else None,
    }


async def list_campaigns(user_id: int) -> list[dict[str, Any]]:
    rows = await prisma.collectioncampaign.find_many(
        where={"user_id": user_id},
        order={"updated_at": "desc"},
        take=50,
        include={"customer": True},
    )
    out: list[dict[str, Any]] = []
    for r in rows:
        c = getattr(r, "customer", None)
        out.append(
            {
                "id": r.id,
                "customer_id": r.customer_id,
                "customer_name": getattr(c, "name", None) if c else None,
                "step_index": r.step_index,
                "status": r.status,
                "next_run_at": r.next_run_at.isoformat() if r.next_run_at else None,
                "last_channel": r.last_channel,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            }
        )
    return out


async def process_due_campaigns(limit: int = 50) -> dict[str, Any]:
    """Invoked by scheduler – advance ladder steps and log outbound touches."""
    now = datetime.now(timezone.utc)
    due = await prisma.collectioncampaign.find_many(
        where={
            "status": "active",
            "next_run_at": {"lte": now},
        },
        take=limit,
        include={"customer": True},
    )
    processed = 0
    for camp in due:
        cust = camp.customer
        phone = getattr(cust, "phone", None) or ""
        step = int(camp.step_index or 0)
        channel = "whatsapp" if (os.environ.get("META_WHATSAPP_TOKEN") or "").strip() else "log"
        body = (
            f"[Ladder day {step + 1}/14] Reminder: outstanding with {getattr(cust, 'name', 'customer')} "
            f"(ref campaign #{camp.id}). Channel={channel}."
        )
        await prisma.notificationlog.create(
            data={
                "user_id": camp.user_id,
                "channel": channel,
                "kind": "collection_ladder",
                "status": "queued",
                "detail": body[:2000],
                "metadata": Json(
                    {
                        "campaign_id": camp.id,
                        "step": step,
                        "customer_id": camp.customer_id,
                        "phone": phone,
                    }
                ),
            }
        )
        new_step = step + 1
        done = new_step > MAX_STEP
        await prisma.collectioncampaign.update(
            where={"id": camp.id},
            data={
                "step_index": new_step,
                "last_channel": channel,
                "next_run_at": None if done else now + timedelta(days=1),
                "status": "completed" if done else "active",
            },
        )
        processed += 1
    return {"processed": processed, "checked_at": now.isoformat()}


async def run_collection_ladder_tick() -> None:
    await process_due_campaigns()
