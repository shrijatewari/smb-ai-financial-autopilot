"""
WhatsApp text commands – balance, today action, reminder, help, report placeholder, else assistant.
"""

from __future__ import annotations

import os
import re
from typing import Any

from db.prisma_client import prisma
from prisma.models import User
from services.assistant_multilingual import run_assistant_multilingual
from services.execution_service import create_razorpay_payment_link
from services.system_snapshot import build_system_snapshot
from services.whatsapp_service import generate_payment_message, send_whatsapp_message


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").lower().strip())


def _format_inr(n: Any) -> str:
    try:
        v = float(n)
    except (TypeError, ValueError):
        return "–"
    return f"₹{v:,.0f}"


def help_menu(lang: str) -> str:
    if (lang or "hi").lower().startswith("en"):
        return (
            "Commands:\n"
            "• balance / cash – your cash position\n"
            "• today / action – top priority today\n"
            "• reminder <name> – send payment reminder (needs customer phone in People)\n"
            "• report – PDF summary (coming soon)\n"
            "• Anything else – ask the AI assistant\n"
            "Reply HELP anytime."
        )
    return (
        "Commands:\n"
        "• kitna aaya / balance / cash – cash position\n"
        "• kya karna / today / action – aaj ka main kaam\n"
        "• reminder <naam> – payment reminder (customer ka number People mein hona chahiye)\n"
        "• report – PDF summary (jald)\n"
        "• Baaki kuch bhi – AI assistant\n"
        "HELP kabhi bhi bhejein."
    )


async def _find_customer_fuzzy(user_id: int, hint: str) -> Any:
    hint = _norm(hint)
    if len(hint) < 2:
        return None
    rows = await prisma.customer.find_many(where={"user_id": user_id})
    for c in rows:
        if hint in _norm(c.name):
            return c
    for c in rows:
        short = c.name.split("(")[0].strip().lower()
        if short and (hint in short or short in hint):
            return c
    return None


async def _handle_reminder(user: User, text: str, lang: str) -> str:
    """Send reminder to matched customer's WhatsApp if phone known."""
    raw = text.strip()
    m = re.search(
        r"(?:reminder|bhejo|send)\s+(?:reminder\s+)?(.+)",
        raw,
        re.I,
    )
    hint = (m.group(1) if m else "").strip()
    if not hint:
        m2 = re.search(r"bhejo\s+(.+)", raw, re.I)
        hint = (m2.group(1) if m2 else "").strip()
    if not hint:
        return (
            "Customer ka naam likhein: jaise `reminder Ramesh`"
            if not lang.startswith("en")
            else "Add a name: e.g. `reminder Ramesh`"
        )

    snap = await build_system_snapshot(user)
    dc = snap.get("daily_control") or {}
    q = dc.get("collection_queue") or []
    customer_row = await _find_customer_fuzzy(user.id, hint)
    amount = None
    display_name = hint
    if customer_row:
        display_name = customer_row.name
        try:
            amount = float(customer_row.total_due or 0) or None
        except (TypeError, ValueError):
            amount = None
    if amount is None or amount <= 0:
        for row in q:
            if hint in _norm(str(row.get("name") or "")):
                amount = float(row.get("amount") or 0)
                display_name = str(row.get("name") or display_name)
                break
    if amount is None or amount <= 0:
        amount = 2400.0

    phone = None
    if customer_row and customer_row.phone:
        phone = "".join(c for c in customer_row.phone if c.isdigit())
        if len(phone) >= 10:
            phone = phone[-10:]

    if not phone:
        return (
            f"{display_name} ka WhatsApp number People / Log mein save karein – tab reminder ja sakta hai."
            if not lang.startswith("en")
            else f"Save {display_name}'s phone under People – then I can send a reminder."
        )

    notes = None
    if customer_row:
        notes = {"user_id": str(user.id), "customer_id": str(customer_row.id)}
    bp = await prisma.businessprofile.find_first(where={"user_id": user.id})
    shop = (bp.business_type if bp else None) or user.name or "Dukaan"
    rzp = create_razorpay_payment_link(
        float(amount),
        display_name[:120],
        phone,
        email=None,
        notes=notes,
        description=f"Payment to {shop} - outstanding dues",
    )
    link = rzp.get("payment_link") or ""
    msg = generate_payment_message(
        display_name,
        float(amount),
        tone="friendly",
        payment_link=link,
        shop_name=str(shop),
    )
    send_whatsapp_message(phone, msg)
    return (
        f"Reminder bheja: {display_name} ({_format_inr(amount)})."
        if not lang.startswith("en")
        else f"Reminder sent to {display_name} ({_format_inr(amount)})."
    )


async def route_whatsapp_intent(message_text: str, user: User) -> str:
    """
    Return reply text for WhatsApp (no markdown).
    """
    lang = (getattr(user, "conversation_language", None) or "hi").lower()
    t = _norm(message_text)

    if not t:
        return "Kuch likhein ya HELP bhejein." if not lang.startswith("en") else "Send a message or type HELP."

    if t in ("help", "menu", "?", "madad"):
        return help_menu(lang)

    if any(
        k in t
        for k in (
            "kitna aaya",
            "balance",
            "cash",
            "kitna paisa",
            "mere paas",
            "cash kitna",
        )
    ):
        snap = await build_system_snapshot(user)
        cash = snap.get("cash")
        m = snap.get("meta") or {}
        exp = m.get("expected_cash")
        line = _format_inr(cash if cash is not None else exp)
        if lang.startswith("en"):
            return f"Cash position (estimate): {line}. Open the app for full runway and actions."
        return f"Cash position (estimate): {line}. Poora runway aur actions ke liye app kholo."

    if any(
        k in t
        for k in (
            "kya karna",
            "what to do",
            "today",
            "action",
            "aaj ka",
            "priority",
        )
    ):
        snap = await build_system_snapshot(user)
        dc = snap.get("daily_control") or {}
        q = dc.get("collection_queue") or []
        primary = snap.get("action") or {}
        meta = primary.get("metadata") or {} if isinstance(primary, dict) else {}
        name = str(meta.get("customer") or (q[0].get("name") if q else "Customer"))
        amt = meta.get("suggested_amount") or (q[0].get("amount") if q else 2400)
        if lang.startswith("en"):
            return f"Today's focus: collect {_format_inr(amt)} from {name}. Use the app for WhatsApp / call buttons."
        return f"Aaj ka main kaam: {name} se {_format_inr(amt)} collect karo. App mein WhatsApp / call buttons hain."

    if "report" in t:
        return (
            "PDF report jald. Abhi poora dashboard web app par dekho."
            if not lang.startswith("en")
            else "PDF report coming soon. Use the web app for the full dashboard."
        )

    if re.search(r"\breminder\b", t) or re.match(r"^bhejo\s+\S", t.strip()):
        return await _handle_reminder(user, message_text, lang)

    # Fallback: AI assistant (same pipeline as POST /assistant/query)
    out = run_assistant_multilingual(
        message_text.strip(),
        output_language="en" if lang.startswith("en") else "hi",
        tone="friendly",
        include_audio=False,
        initial_balance=10_000.0,
        horizon_days=30,
    )
    reply = str(out.get("response") or "").strip()
    if len(reply) > 3500:
        reply = reply[:3497] + "..."
    return reply or ("Theek hai." if not lang.startswith("en") else "OK.")
