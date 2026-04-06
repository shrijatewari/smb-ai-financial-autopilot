"""
Outbound voice calls – Twilio Voice + Hindi TTS via TwiML <Say>.

Requires: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER (E.164).
Trial accounts can only call verified numbers.
"""

from __future__ import annotations

import html
import logging
import os
import re
from typing import Any

logger = logging.getLogger(__name__)


def twilio_configured() -> bool:
    return bool(
        (os.getenv("TWILIO_ACCOUNT_SID") or "").strip()
        and (os.getenv("TWILIO_AUTH_TOKEN") or "").strip()
        and (os.getenv("TWILIO_FROM_NUMBER") or "").strip()
    )


def _to_e164_in(phone: str) -> str | None:
    d = re.sub(r"\D", "", phone or "")
    if len(d) == 10:
        return "+91" + d
    if d.startswith("91") and len(d) >= 12:
        return "+" + d
    if phone.strip().startswith("+") and len(d) >= 10:
        return "+" + d.lstrip("+")
    return None


def make_call(phone: str, text: str) -> dict[str, Any]:
    """
    Place an outbound call that speaks `text` in Hindi (Polly Aditi + hi-IN).

    Returns mock dict when Twilio is not configured (demo / hackathon safe).
    """
    text = (text or "").strip()
    if not text:
        return {"status": "error", "detail": "Empty script", "mock": True}

    to = _to_e164_in(phone)
    if not to:
        return {"status": "error", "detail": "Invalid phone (use 10-digit Indian number)", "mock": True}

    if not twilio_configured():
        return {
            "status": "queued",
            "mock": True,
            "to": to,
            "detail": "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER for live calls",
            "preview": text[:500],
        }

    try:
        from twilio.rest import Client
    except ImportError:  # pragma: no cover
        return {"status": "error", "detail": "twilio package not installed", "mock": True}

    sid = os.environ["TWILIO_ACCOUNT_SID"].strip()
    token = os.environ["TWILIO_AUTH_TOKEN"].strip()
    from_num = os.environ["TWILIO_FROM_NUMBER"].strip()

    safe = html.escape(text)
    twiml = f'<?xml version="1.0" encoding="UTF-8"?><Response><Say language="hi-IN">{safe}</Say></Response>'

    client = Client(sid, token)
    try:
        call = client.calls.create(twiml=twiml, to=to, from_=from_num)
        return {
            "status": "queued",
            "mock": False,
            "to": to,
            "sid": call.sid,
            "preview": text[:500],
        }
    except Exception as e:  # pragma: no cover
        logger.exception("Twilio call failed")
        return {"status": "error", "detail": str(e), "mock": False, "to": to}
