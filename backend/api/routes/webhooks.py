"""External webhooks – Meta WhatsApp Cloud API, Razorpay payments."""

from __future__ import annotations

import json
import logging
import os

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from prisma.fields import Json

from db.prisma_client import prisma
from services.razorpay_webhook import process_payment_captured, verify_razorpay_signature
from services.whatsapp_bot import verify_webhook
from services.whatsapp_inbound import process_whatsapp_webhook_payload

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/whatsapp", response_class=PlainTextResponse)
def whatsapp_verify_get(
    hub_mode: str | None = Query(None, alias="hub.mode"),
    hub_verify_token: str | None = Query(None, alias="hub.verify_token"),
    hub_challenge: str | None = Query(None, alias="hub.challenge"),
):
    """Meta webhook verification (subscribe) – must return challenge as plain text."""
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
    """
    Meta WhatsApp Cloud webhook – inbound text: intent router (balance, today, reminder, HELP),
    else assistant pipeline; unknown numbers get signup link. Rate limit 20 replies/user/hour.
    """
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON") from None
    return await process_whatsapp_webhook_payload(payload)


@router.post("/razorpay")
async def razorpay_webhook(request: Request):
    """
    Razorpay webhook: verify `X-Razorpay-Signature` (HMAC-SHA256 of raw body) when
    `RAZORPAY_WEBHOOK_SECRET` is set. Handles `payment.captured` – ledger credit, dues update, action complete.
    """
    body_bytes = await request.body()
    secret = (os.getenv("RAZORPAY_WEBHOOK_SECRET") or "").strip()
    sig = (request.headers.get("X-Razorpay-Signature") or "").strip()

    if secret:
        if not sig or not verify_razorpay_signature(body_bytes, sig, secret):
            raise HTTPException(status_code=400, detail="Invalid Razorpay signature")
    else:
        logger.warning("RAZORPAY_WEBHOOK_SECRET not set – accepting webhook without signature (dev only)")

    try:
        payload = json.loads(body_bytes.decode("utf-8"))
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid JSON body") from e

    event_type = str(payload.get("event") or "")
    log_row = await prisma.webhooklog.create(
        data={
            "provider": "razorpay",
            "event_type": event_type or "unknown",
            "payload": Json(payload),
            "status": "received",
        }
    )

    result: dict = {"ok": True, "event": event_type}
    try:
        if event_type == "payment.captured":
            out = await process_payment_captured(payload)
            result.update(out)
            await prisma.webhooklog.update(
                where={"id": log_row.id},
                data={"status": "processed"},
            )
        else:
            await prisma.webhooklog.update(
                where={"id": log_row.id},
                data={"status": "ignored"},
            )
    except Exception as e:
        logger.exception("Razorpay webhook processing failed")
        await prisma.webhooklog.update(
            where={"id": log_row.id},
            data={"status": "error"},
        )
        raise HTTPException(status_code=500, detail=str(e)) from e

    return JSONResponse(content=result)
