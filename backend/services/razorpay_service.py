"""
Razorpay Payment Links – official Python SDK when keys are set; REST fallback; mock otherwise.

Docs: https://razorpay.com/docs/api/payment-links/
"""

from __future__ import annotations

import os
import uuid
from typing import Any

import requests
from requests.auth import HTTPBasicAuth

try:
    import razorpay
except ImportError:  # pragma: no cover
    razorpay = None

# Fake `https://rzp.io/i/plink_*` URLs are not created in Razorpay’s system – the resolver returns `{}`.
# When keys are absent, return a stable public URL so “Open link” still lands on a real page.
MOCK_PAYMENT_LINK_URL = "https://razorpay.com/docs/payment-links/"


def create_payment_link(
    amount_inr: float,
    customer_name: str,
    phone: str,
    email: str | None = None,
    notes: dict[str, str] | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    """
    Create a payment link (POST https://api.razorpay.com/v1/payment_links).
    Amount in INR; Razorpay expects paise (amount * 100).

    Returns: payment_link (short_url), status, id, mock (bool), optional fallback_reason.
    """
    key_id = os.environ.get("RAZORPAY_KEY_ID", "").strip()
    key_secret = os.environ.get("RAZORPAY_KEY_SECRET", "").strip()

    paise = max(100, int(round(float(amount_inr) * 100)))
    digits = "".join(ch for ch in phone if ch.isdigit())
    if len(digits) >= 10:
        contact = f"+91{digits[-10:]}"
    else:
        contact = "+919004930401"

    desc = (description or "").strip() or f"Payment request – {customer_name[:80]}"
    payload: dict[str, Any] = {
        "amount": paise,
        "currency": "INR",
        "accept_partial": False,
        "description": desc[:255],
        "customer": {
            "name": customer_name[:120],
            "contact": contact,
            "email": (email or "customer@example.com")[:120],
        },
        "notify": {"sms": True, "email": bool(email)},
        "reminder_enable": True,
    }
    if notes:
        # Razorpay notes: string values only (returned on payment webhooks).
        payload["notes"] = {str(k): str(v) for k, v in notes.items() if v is not None}

    if not key_id or not key_secret:
        return _mock_response(amount_inr, customer_name, contact, None)

    # 1) Official SDK (preferred)
    if razorpay is not None:
        try:
            client = razorpay.Client(auth=(key_id, key_secret))
            data = client.payment_link.create(payload)
            return {
                "payment_link": data.get("short_url") or data.get("url"),
                "status": str(data.get("status") or "created"),
                "id": data.get("id"),
                "mock": False,
            }
        except Exception as e:
            sdk_err = str(e)
    else:
        sdk_err = "razorpay package not installed"

    # 2) HTTPS REST fallback (same auth as SDK)
    try:
        r = requests.post(
            "https://api.razorpay.com/v1/payment_links",
            json=payload,
            auth=HTTPBasicAuth(key_id, key_secret),
            timeout=45,
        )
        r.raise_for_status()
        data = r.json()
        return {
            "payment_link": data.get("short_url") or data.get("url"),
            "status": data.get("status") or "created",
            "id": data.get("id"),
            "mock": False,
        }
    except Exception as e:
        return _mock_response(amount_inr, customer_name, contact, f"{sdk_err}; REST: {e}")


def _mock_response(amount_inr: float, customer_name: str, contact: str, err: str | None) -> dict[str, Any]:
    rid = f"mock_{uuid.uuid4().hex[:12]}"
    out: dict[str, Any] = {
        "payment_link": MOCK_PAYMENT_LINK_URL,
        "status": "created",
        "id": rid,
        "mock": True,
        "note": "Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET for real checkout links (rzp.io). This URL is documentation only.",
    }
    if err:
        out["fallback_reason"] = err
    out["customer_contact"] = contact
    out["amount_inr"] = round(float(amount_inr), 2)
    return out
