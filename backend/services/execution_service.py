"""Simulated payment execution (Paytm-style) with correlation IDs.

Real Razorpay payment links (live when ``RAZORPAY_KEY_ID`` / ``RAZORPAY_KEY_SECRET`` are set)
live in ``services.razorpay_service`` and are exposed as ``POST /execute/payment-link``.
"""

from __future__ import annotations

import uuid

from typing import Any

from services import paytm_service


def create_paytm_demo_link(amount: float, customer: str) -> str:
    return paytm_service.create_payment_link(amount, customer)


def create_razorpay_payment_link(
    amount_inr: float,
    customer_name: str,
    phone: str,
    email: str | None = None,
    notes: dict[str, str] | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    """
    Real Razorpay payment link (paise = amount_inr * 100). Uses official ``razorpay`` SDK
    when ``RAZORPAY_KEY_ID`` / ``RAZORPAY_KEY_SECRET`` are set; otherwise mock / REST fallback.
    """
    from services.razorpay_service import create_payment_link

    return create_payment_link(
        amount_inr, customer_name, phone, email, notes=notes, description=description
    )


def send_collect_request(customer: str, amount: float, link: str | None = None) -> tuple[str, str]:
    """Returns (human_message, correlation_id)."""
    cid = str(uuid.uuid4())
    msg = paytm_service.send_payment_request(customer, amount, link=link)
    return f"{msg} [ref: {cid}]", cid


def execute_collect_payment(amount: float, customer: str) -> dict:
    link = create_paytm_demo_link(amount, customer)
    msg, cid = send_collect_request(customer, amount, link=link)
    return {
        "status": "accepted",
        "message": msg,
        "payment_link": link,
        "correlation_id": cid,
    }
