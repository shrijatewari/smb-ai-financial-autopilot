"""
WhatsApp bot layer – outbound reminders + Meta Cloud webhook handling.

Outbound uses the same Graph API as `whatsapp_service.send_whatsapp_message`.
Inbound messages are handled in `whatsapp_inbound` (intents, rate limit, replies).
"""

from __future__ import annotations

import logging
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


# Inbound message handling lives in `services.whatsapp_inbound` (intents + rate limit + replies).
