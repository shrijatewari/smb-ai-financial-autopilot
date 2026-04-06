"""Process Meta WhatsApp Cloud inbound webhooks – user match, rate limit, intents, replies."""

from __future__ import annotations

import logging
import os
from typing import Any

from prisma.models import User

from db.prisma_client import prisma
from services.whatsapp_intent_router import route_whatsapp_intent
from services.whatsapp_rate_limit import allow_reply
from services.whatsapp_service import send_whatsapp_message

logger = logging.getLogger(__name__)


def _signup_url() -> str:
    base = (os.getenv("PUBLIC_APP_URL") or "http://localhost:5173").strip().rstrip("/")
    return f"{base}/signup"


def _digits_match(a: str, b: str) -> bool:
    da = "".join(c for c in a if c.isdigit())
    db = "".join(c for c in b if c.isdigit())
    if len(da) < 10 or len(db) < 10:
        return False
    return da[-10:] == db[-10:]


async def find_user_by_whatsapp_sender(from_id: str) -> User | None:
    """Match Meta `from` (digits) to User.whatsapp_number or trusted_helper_phone."""
    fd = "".join(c for c in from_id if c.isdigit())
    if len(fd) < 10:
        return None
    users = await prisma.user.find_many(where={"is_active": True})
    for u in users:
        for raw in (getattr(u, "whatsapp_number", None), getattr(u, "trusted_helper_phone", None)):
            if raw and _digits_match(fd, raw):
                return u
    return None


async def process_whatsapp_webhook_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """
    Parse Meta payload, reply to each inbound text message.
    """
    processed: list[dict[str, Any]] = []
    try:
        for ent in payload.get("entry") or []:
            for ch in ent.get("changes") or []:
                val = ch.get("value") or {}
                for msg in val.get("messages") or []:
                    from_id = msg.get("from")
                    if not from_id:
                        continue
                    if msg.get("type") != "text":
                        processed.append({"from": from_id, "skipped": msg.get("type")})
                        continue
                    body = (msg.get("text") or {}).get("body") or ""
                    body = (body or "")[:2000]

                    user = await find_user_by_whatsapp_sender(str(from_id))
                    if user is None:
                        unreg = (
                            f"Aapka number registered nahi hai. Yahan signup karein: {_signup_url()}"
                        )
                        send_whatsapp_message(str(from_id), unreg)
                        processed.append(
                            {"from": from_id, "body": body[:80], "reply": "unregistered"}
                        )
                        logger.info("WhatsApp inbound unregistered from=%s", from_id)
                        continue

                    if not allow_reply(user.id):
                        lim = (
                            "Bahut saare messages – thodi der baad try karein (max 20 / hour)."
                            if (getattr(user, "conversation_language", "hi") or "hi").lower().startswith("hi")
                            else "Too many messages – try again in a bit (max 20 / hour)."
                        )
                        send_whatsapp_message(str(from_id), lim)
                        processed.append({"from": from_id, "reply": "rate_limited"})
                        continue

                    try:
                        reply = await route_whatsapp_intent(body, user)
                    except Exception as e:
                        logger.exception("WhatsApp intent route failed: %s", e)
                        reply = (
                            "Kuch gadbad ho gayi – thodi der baad try karein."
                            if not (getattr(user, "conversation_language", "hi") or "hi").lower().startswith("en")
                            else "Something went wrong – try again shortly."
                        )

                    send_whatsapp_message(str(from_id), reply)
                    processed.append(
                        {
                            "from": from_id,
                            "body": body[:120],
                            "user_id": user.id,
                            "reply_len": len(reply),
                        }
                    )
                    logger.info("WhatsApp bot reply user=%s from=%s", user.id, from_id)
    except Exception as e:
        logger.exception("webhook process: %s", e)
        return {"ok": False, "error": str(e), "messages": processed}

    return {"ok": True, "handled": len(processed), "messages": processed}
