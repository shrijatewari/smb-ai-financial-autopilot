"""
Simulated Paytm-style payment APIs for demo / hackathon integrations.

No real network calls – returns deterministic fake URLs and success payloads.
"""

from __future__ import annotations

from urllib.parse import quote_plus

import pandas as pd

from services import payment_tracking


def get_transactions(user_id: str, df: pd.DataFrame | None = None) -> list[dict]:
    """
    Return the current transaction ledger for a user (same shape as dashboard rows).

    `df` should be the classified pipeline frame; if None, caller must load data first.
    """
    if df is None or df.empty:
        return []

    rows = []
    for _, r in df.iterrows():
        rows.append(
            {
                "user_id": user_id,
                "date": r["date"].strftime("%Y-%m-%d") if hasattr(r["date"], "strftime") else str(r["date"]),
                "amount": float(abs(r["amount"])),
                "type": str(r["type"]),
                "description": str(r.get("description", "")),
                "category": str(r.get("category", "")),
            }
        )
    return rows


def create_payment_link(amount: float, customer: str) -> str:
    """Fake Paytm checkout URL; registered for tracking (pending)."""
    amt = round(float(amount), 2)
    cust_q = quote_plus(customer[:80])
    url = f"https://paytm.com/pay?amount={amt}&customer={cust_q}"
    payment_tracking.register_link(url, amt, customer, status="pending")
    return url


def send_payment_request(customer: str, amount: float, link: str | None = None) -> str:
    """Simulated push/SMS payment request; marks link as sent when provided."""
    if link:
        payment_tracking.mark_sent(link)
    return (
        f"Payment request sent to '{customer[:50]}' for ₹{amount:,.2f} "
        "(simulated – no funds moved)."
    )
