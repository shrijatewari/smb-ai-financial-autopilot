"""External webhooks — Meta WhatsApp Cloud API."""

from __future__ import annotations

import os

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse

from services.whatsapp_bot import handle_incoming_webhook, verify_webhook

router = APIRouter()


@router.get("/whatsapp", response_class=PlainTextResponse)
def whatsapp_verify_get(
    hub_mode: str | None = Query(None, alias="hub.mode"),
    hub_verify_token: str | None = Query(None, alias="hub.verify_token"),
    hub_challenge: str | None = Query(None, alias="hub.challenge"),
):
    """Meta webhook verification (subscribe) — must return challenge as plain text."""
    token = (os.getenv("WHATSAPP_VERIFY_TOKEN") or "").strip()
    if not token:
        raise HTTPException(
            status_code=503,
            detail="Set WHATSAPP_VERIFY_TOKEN in .env to match the Meta dashboard",
        )
    out = verify_webhook(hub_mode, hub_verify_token, hub_challenge, token)
    if out is None:
        raise HTTPException(status_code=403, detail="Verification failed")
    return str(out)


@router.post("/whatsapp")
async def whatsapp_inbound_post(request: Request):
    """Receive message status + user replies from Meta."""
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON") from None
    return handle_incoming_webhook(payload)
