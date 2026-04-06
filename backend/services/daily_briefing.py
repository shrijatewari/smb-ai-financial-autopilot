"""
Scheduled WhatsApp daily financial brief (8:00 AM IST = 02:30 UTC).
"""

from __future__ import annotations

import logging
import os
from decimal import Decimal

from prisma.fields import Json

from db.prisma_client import prisma
from prisma.models import User
from services.system_snapshot import build_system_snapshot
from services.whatsapp_service import send_whatsapp_message

logger = logging.getLogger(__name__)


def _format_inr(amount: float | Decimal | None) -> str:
    if amount is None:
        return "–"
    try:
        n = float(amount)
    except (TypeError, ValueError):
        return "–"
    return f"₹{n:,.0f}"


def _briefing_text_hindi(
    business_name: str,
    cash: float | None,
    runway_days: int | None,
    top_name: str,
    top_amount: float | None,
) -> str:
    cash_line = _format_inr(cash)
    if runway_days is None:
        runway_line = "data estimate nahi"
    else:
        runway_line = f"{runway_days} din"
    amt = _format_inr(top_amount)
    return (
        f"🌅 Suprabhat {business_name}!\n\n"
        f"📊 Aaj ka financial brief:\n"
        f"💰 Cash balance: {cash_line}\n"
        f"⏳ Runway: {runway_line}\n"
        f"🎯 Aaj ka kaam: {top_name} se {amt} collect karein\n\n"
        f"Reply HELP for voice assistant."
    )


def _briefing_text_english(
    business_name: str,
    cash: float | None,
    runway_days: int | None,
    top_name: str,
    top_amount: float | None,
) -> str:
    cash_line = _format_inr(cash)
    if runway_days is None:
        runway_line = "n/a (estimate)"
    else:
        runway_line = f"{runway_days} days"
    amt = _format_inr(top_amount)
    return (
        f"🌅 Good morning {business_name}!\n\n"
        f"📊 Today's financial brief:\n"
        f"💰 Cash balance: {cash_line}\n"
        f"⏳ Runway: {runway_line}\n"
        f"🎯 Today's focus: collect {amt} from {top_name}\n\n"
        f"Reply HELP for voice assistant."
    )


async def _business_display_name(user: User) -> str:
    bp = await prisma.businessprofile.find_unique(where={"user_id": user.id})
    if bp and getattr(bp, "business_type", None):
        return f"{user.name.strip()} ({bp.business_type})"
    return user.name.strip()


async def send_daily_briefings() -> None:
    """APScheduler job – runs in UTC; cron set for 8:00 AM IST."""
    if os.getenv("BRIEFING_ENABLED", "true").strip().lower() not in ("1", "true", "yes"):
        logger.info("Daily briefing skipped (BRIEFING_ENABLED=false)")
        return

    users = await prisma.user.find_many(
        where={
            "is_active": True,
            "morning_briefing_enabled": True,
            "whatsapp_number": {"not": None},
        }
    )

    for u in users:
        phone = (u.whatsapp_number or "").strip()
        if not phone:
            continue
        try:
            user = await prisma.user.find_unique(where={"id": u.id})
            if not user:
                continue
            snap = await build_system_snapshot(user)
            name = await _business_display_name(user)
            cash = snap.get("cash")
            if cash is not None:
                try:
                    cash = float(cash)
                except (TypeError, ValueError):
                    cash = None
            dc = snap.get("daily_control") or {}
            runway = dc.get("days_to_negative")
            if runway is not None:
                try:
                    runway = int(runway)
                except (TypeError, ValueError):
                    runway = None
            q = dc.get("collection_queue") or []
            top = q[0] if q else {}
            top_name = str(top.get("name") or "Customer")
            top_amt = top.get("amount")
            if top_amt is not None:
                try:
                    top_amt = float(top_amt)
                except (TypeError, ValueError):
                    top_amt = None

            lang = (getattr(user, "conversation_language", None) or "hi").strip().lower()
            if lang == "en":
                text = _briefing_text_english(name, cash, runway, top_name, top_amt)
            else:
                text = _briefing_text_hindi(name, cash, runway, top_name, top_amt)

            res = send_whatsapp_message(phone, text)
            status = str(res.get("status") or "unknown")
            mock = bool(res.get("mock"))
            status_db = "mock" if mock else ("sent" if status == "sent" else "error")
            detail = None
            if status_db == "error":
                detail = str(res.get("detail") or res)[:2000]

            await prisma.notificationlog.create(
                data={
                    "user_id": user.id,
                    "channel": "whatsapp",
                    "kind": "daily_briefing",
                    "status": status_db,
                    "detail": detail,
                    "metadata": Json(
                        {
                            "mock": mock,
                            "phone": res.get("phone"),
                            "meta_message_id": res.get("meta_message_id"),
                        }
                    ),
                }
            )
        except Exception as e:
            logger.exception("Daily briefing failed for user %s: %s", u.id, e)
            try:
                await prisma.notificationlog.create(
                    data={
                        "user_id": u.id,
                        "channel": "whatsapp",
                        "kind": "daily_briefing",
                        "status": "error",
                        "detail": str(e)[:2000],
                        "metadata": Json({}),
                    }
                )
            except Exception:
                logger.exception("Could not write notification log")
