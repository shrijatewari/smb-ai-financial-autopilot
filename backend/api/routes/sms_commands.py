"""Plain-text SMS-style commands (BAL, RISK, PAY) for low-bandwidth / gateway demos."""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from auth.deps import get_current_user
from prisma.models import User
from services.onboarding_persistence import ensure_user_business_context_loaded
from services.dashboard_profile import resolve_user_dashboard_profile
from state.global_state import get_snapshot
import copy

router = APIRouter()


class SmsCommandBody(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)


def _inr(n: float | None) -> str:
    if n is None:
        return "–"
    return f"₹{n:,.0f}"


@router.post("/commands")
async def sms_commands(body: SmsCommandBody, user: User = Depends(get_current_user)):
    """
    Authenticated SMS-style parser (same logic a Twilio webhook can call server-side).

    Commands (case-insensitive, first word):
    - BAL → rough cash / balance hint from live snapshot
    - RISK → risk line
    - PAY → suggested collection action one-liner
    """
    raw = body.text.strip().upper()
    token = re.split(r"\s+", raw)[0] if raw else ""

    snap = copy.deepcopy(get_snapshot())
    await ensure_user_business_context_loaded(user.id)
    modules, profile_type, doc_prof = resolve_user_dashboard_profile(user.id)
    snap["modules"] = modules
    snap["profile_type"] = profile_type
    snap["document_profile"] = doc_prof

    dc = snap.get("daily_control") or {}
    risk = snap.get("risk")
    days_neg = dc.get("days_to_negative")
    meta = snap.get("meta") or {}
    recon = snap.get("reconstruction") or {}
    forecast = snap.get("cash")
    if forecast is None:
        forecast = recon.get("estimated_cash")
    if forecast is None:
        forecast = meta.get("expected_cash")

    if token in ("BAL", "BALANCE", "PAISA"):
        line = f"Aapke system ke hisaab se cash lagbhag {_inr(forecast)} hai."
        if days_neg is not None and days_neg <= 30:
            line += f" Stress timing ~{days_neg} din."
        return {"reply": line, "command": "BAL"}

    if token in ("RISK", "KHATRA"):
        if risk is not None:
            pct = 100 * float(risk)
            line = f"Risk score lagbhag {pct:.0f}% – collections par dhyan dein."
        else:
            line = "Risk abhi estimate nahi ho paya – thodi der baad try karein."
        if days_neg is not None:
            line += f" Paisa khatam hone ka estimate ~{days_neg} din."
        return {"reply": line, "command": "RISK"}

    if token in ("PAY", "COLLECT", "VASOOL"):
        primary = snap.get("action") or {}
        action_meta = primary.get("metadata") or {}
        q = dc.get("collection_queue") or []
        top = q[0] if q else {}
        name = str(action_meta.get("customer") or top.get("name") or "Customer")
        amt = action_meta.get("suggested_amount") or top.get("amount")
        if amt is not None:
            line = f"Suggested: {name} se {_inr(float(amt))} collect karein – app mein WhatsApp / call use karein."
        else:
            line = "Pehle app mein customer select karein – phir reminder bhejein."
        return {"reply": line, "command": "PAY"}

    return {
        "reply": "Bhejein: BAL (balance), RISK (risk), PAY (suggested action).",
        "command": "HELP",
    }
