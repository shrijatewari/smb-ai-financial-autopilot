"""Dynamic module selection from business vector and onboarding rules."""

from __future__ import annotations

from typing import Any


def select_modules(business_vector: list[float], onboarding: dict[str, Any] | None) -> list[dict[str, Any]]:
    """
    Return prioritized modules: cash, inventory, credit, payables, compliance, customers.

    Rules:
    - High inventory → prioritize inventory; service / none → drop inventory from active set
    - Credit usage → boost credit
    - GST → boost compliance
    - Cash-heavy → slight cash boost
    - Repeat / subscription customers → boost customers; one-time → low
    - Higher turnover bands → slightly richer cash + compliance signals
    """
    ob = onboarding or {}
    rev = str(ob.get("revenue_model", "")).lower()
    inv = str(ob.get("inventory_type", "low")).lower()
    cred = str(ob.get("credit_usage", "none")).lower()
    cust = str(ob.get("customer_type", "repeat")).lower()
    turnover = str(ob.get("monthly_turnover_range", "")).lower()

    modules: dict[str, float] = {
        "cash": 0.92,
        "inventory": 0.55,
        "credit": 0.45,
        "payables": 0.5,
        "compliance": 0.42,
        "customers": 0.38,
    }

    inv_signal = float(business_vector[3]) if len(business_vector) > 3 else 0.33

    # Scale / complexity from turnover (dashboard depth)
    high_scale = any(
        x in turnover
        for x in (
            "1cr",
            "cr+",
            "25l-1cr",
            "50l_plus",
            "50l+",
            "5l_to_50l",
            "5l-50l",
        )
    )
    if high_scale:
        modules["cash"] = min(0.99, modules["cash"] + 0.04)
        modules["compliance"] = min(0.95, modules["compliance"] + 0.08)

    if rev == "service" or inv == "none":
        modules["inventory"] = 0.0
        modules["customers"] = min(0.98, modules["customers"] + 0.12)
    elif inv in ("high", "high_value") or inv_signal > 0.55:
        modules["inventory"] = max(modules["inventory"], 0.88)
        modules["cash"] = min(0.98, modules["cash"] + 0.02)
        modules["customers"] = min(modules["customers"], 0.28)

    if cred in ("formal", "informal"):
        modules["credit"] = max(modules["credit"], 0.78 if cred == "formal" else 0.62)

    if bool(ob.get("gst_registered")):
        modules["compliance"] = max(modules["compliance"], 0.74)

    pm = ob.get("payment_mix") or {}
    try:
        cash_share = float(pm.get("cash", 0.5))
    except (TypeError, ValueError):
        cash_share = 0.5
    if cash_share >= 0.6:
        modules["cash"] = min(0.99, modules["cash"] + 0.05)

    if cust in ("repeat", "subscription"):
        modules["customers"] = max(modules["customers"], 0.72 if cust == "subscription" else 0.65)
    elif cust == "one_time":
        modules["customers"] = min(modules["customers"], 0.22)

    # Order by priority descending; drop effectively-disabled modules
    ordered = sorted(modules.items(), key=lambda x: -x[1])
    return [{"name": name, "priority": round(pri, 2)} for name, pri in ordered if pri >= 0.08]


def infer_profile_type_label(onboarding: dict[str, Any] | None, business_vector: list[float]) -> str:
    """
    Human-readable business archetype for dashboard / API (e.g. high_inventory_cash_heavy).
    """
    ob = onboarding or {}
    inv = str(ob.get("inventory_type", "low")).lower()
    pm = ob.get("payment_mix") or {}
    try:
        cash = float(pm.get("cash", 0.5))
    except (TypeError, ValueError):
        cash = 0.5
    cred = str(ob.get("credit_usage", "none")).lower()
    inv_signal = float(business_vector[3]) if len(business_vector) > 3 else 0.33

    parts: list[str] = []
    if inv in ("high", "high_value") or inv_signal > 0.55:
        parts.append("high_inventory")
    elif inv == "none":
        parts.append("no_inventory")
    else:
        parts.append("moderate_inventory")

    if cash >= 0.55:
        parts.append("cash_heavy")
    else:
        parts.append("digital_heavy")

    if cred in ("formal", "informal"):
        parts.append("credit_active")
    else:
        parts.append("credit_light")

    return "_".join(parts)
