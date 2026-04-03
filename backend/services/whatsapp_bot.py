"""
WhatsApp bot layer — outbound reminders + Meta Cloud webhook handling.

Outbound uses the same Graph API as `whatsapp_service.send_whatsapp_message`.
Inbound webhooks parse customer replies (demo: log + ack; extend to update ledger).
"""

from __future__ import annotations

import logging
import os
from typing import Any

from services.whatsapp_service import send_whatsapp_message

logger = logging.getLogger(__name__)


def send_reminder(phone: str, message: str) -> dict[str, Any]:
    """
    Send a payment or follow-up message. `phone` may be 10-digit IN or E.164 digits.
    """
    return send_whatsapp_message(phone, message)


def verify_webhook(mode: str | None, token: str | None, challenge: str | None, verify_token: str) -> str | None:
    """
    Meta GET verification. Returns challenge string if valid, else None.
    Set WHATSAPP_VERIFY_TOKEN in .env to match Meta dashboard.
    """
    if (mode or "").strip() == "subscribe" and token == verify_token:
        return challenge or ""
    return None


def handle_incoming_webhook(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Parse Meta WhatsApp webhook JSON. Returns a small summary for logging / future CRM updates.

    Typical shape: entry[].changes[].value.messages[] with type, from, text.body
    """
    processed: list[dict[str, Any]] = []
    try:
        for ent in payload.get("entry") or []:
            for ch in ent.get("changes") or []:
                val = ch.get("value") or {}
                for msg in val.get("messages") or []:
                    from_id = msg.get("from")
                    body = ""
                    if msg.get("type") == "text":
                        body = (msg.get("text") or {}).get("body") or ""
                    processed.append(
                        {
                            "from": from_id,
                            "type": msg.get("type"),
                            "body": body[:2000],
                            "id": msg.get("id"),
                        }
                    )
                    logger.info("WhatsApp inbound from=%s len=%s", from_id, len(body))
    except Exception as e:  # pragma: no cover
        logger.exception("webhook parse: %s", e)
        return {"ok": False, "error": str(e), "messages": processed}

    # TODO: match `from` to Customer.phone, append to ledger / RL reward
    return {"ok": True, "received": len(processed), "messages": processed}
