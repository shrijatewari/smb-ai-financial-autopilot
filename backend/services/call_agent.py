"""Simulated AI voice call – script + outcome (no real telephony in demo)."""

from __future__ import annotations

from typing import Any


def simulate_call(customer: str, amount: float) -> dict[str, Any]:
    first = customer.split("(")[0].split(",")[0].strip() or customer
    script = (
        f"Hi {first}, this is a reminder for ₹{amount:,.0f} pending payment. "
        "Kindly clear it today to avoid disruption to your account."
    )
    return {
        "status": "completed",
        "script": script,
        "likelihood": "high",
    }
