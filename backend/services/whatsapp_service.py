"""WhatsApp payment reminders — Meta Cloud API when configured, else simulated send."""

from __future__ import annotations

import os
from typing import Any

import requests


def default_payment_link(amount: float) -> str:
    """Demo deep link shape; replace with Razorpay short link from `/execute/payment-link` when wired."""
    return f"https://paytm.com/pay?amount={int(round(amount))}"


def generate_payment_message(
    customer: str,
    amount: float,
    tone: str = "formal",
    payment_link: str | None = None,
) -> str:
    """
    Smart variants:
    - formal: professional reminder
    - friendly: Hinglish / shop-floor tone
    """
    link = payment_link or default_payment_link(amount)
    tone_norm = (tone or "formal").lower().strip()
    first = customer.split("(")[0].split(",")[0].strip() or customer

    if tone_norm == "friendly":
        return (
            f"Hi bhaiya, ₹{amount:,.0f} pending hai — pls clear kar dena. "
            f"Pay here: {link}"
        )

    return (
        f"Hi {first}, this is a payment reminder for ₹{amount:,.0f}. "
        f"Please clear at your earliest convenience. Pay here: {link}"
    )


def _digits_only(phone: str) -> str:
    return "".join(c for c in phone if c.isdigit())


def _meta_recipient_id(phone: str) -> str:
    """Meta expects E.164 without + (digits only). Optional default country code for 10-digit local numbers."""
    d = _digits_only(phone)
    if len(d) == 10:
        cc = (os.getenv("WHATSAPP_DEFAULT_COUNTRY_CODE") or "").strip().lstrip("+")
        if cc:
            return cc + d
    return d


def meta_whatsapp_configured() -> bool:
    return bool(
        (os.getenv("WHATSAPP_PHONE_NUMBER_ID") or "").strip()
        and (os.getenv("WHATSAPP_ACCESS_TOKEN") or "").strip()
    )


def send_whatsapp_message(phone: str, message: str) -> dict[str, Any]:
    """
    Outbound WhatsApp text.

    When `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` are set, calls Meta Graph API:
    POST https://graph.facebook.com/<version>/<PHONE_NUMBER_ID>/messages

    Otherwise returns a simulated success (same shape, `mock: true`).
    """
    to = _meta_recipient_id(phone)
    if len(to) < 8:
        return {
            "status": "error",
            "mock": True,
            "phone": phone,
            "detail": "Invalid phone for WhatsApp (need full international digits or 10-digit + WHATSAPP_DEFAULT_COUNTRY_CODE).",
        }

    if not meta_whatsapp_configured():
        return {
            "status": "sent",
            "mock": True,
            "phone": to,
            "message": message,
        }

    phone_number_id = (os.getenv("WHATSAPP_PHONE_NUMBER_ID") or "").strip()
    token = (os.getenv("WHATSAPP_ACCESS_TOKEN") or "").strip()
    version = (os.getenv("WHATSAPP_GRAPH_API_VERSION") or "v21.0").strip()
    url = f"https://graph.facebook.com/{version}/{phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    body = message.strip()
    if len(body) > 4096:
        body = body[:4093] + "..."

    payload: dict[str, Any] = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": "text",
        "text": {"preview_url": False, "body": body},
    }

    try:
        r = requests.post(url, json=payload, headers=headers, timeout=45)
        data = r.json() if r.content else {}
    except requests.RequestException as e:
        return {
            "status": "error",
            "mock": False,
            "phone": to,
            "detail": str(e),
        }

    if r.status_code >= 400:
        err = data.get("error") if isinstance(data, dict) else {}
        msg = err.get("message") if isinstance(err, dict) else None
        return {
            "status": "error",
            "mock": False,
            "phone": to,
            "detail": msg or r.text or f"HTTP {r.status_code}",
            "meta": data,
        }

    return {
        "status": "sent",
        "mock": False,
        "phone": to,
        "message": message,
        "meta_message_id": (data.get("messages") or [{}])[0].get("id") if isinstance(data, dict) else None,
        "meta": data,
    }
