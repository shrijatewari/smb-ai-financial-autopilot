"""Contextual action-screen contract (not a generic dashboard)."""

from __future__ import annotations

from typing import Any


def build_dashboard_context(snap: dict[str, Any], onboarding: dict[str, Any] | None) -> dict[str, Any]:
    """
    Drives frontend: what to emphasize (inventory vs service vs credit), risk level, literacy UI.
    """
    ob = onboarding or {}
    risk = float(snap.get("risk") or 0.0)
    dc = snap.get("daily_control") or {}
    days_neg = dc.get("days_to_negative")
    meta = snap.get("meta") or {}
    tick = int(meta.get("tick") or 0)

    if (days_neg is not None and days_neg <= 7) or risk > 0.35:
        risk_level = "high"
    elif (days_neg is not None and days_neg <= 14) or risk > 0.2:
        risk_level = "medium"
    else:
        risk_level = "low"

    revenue_model = str(ob.get("revenue_model") or "hybrid")
    inv = str(ob.get("inventory_type") or "low")
    credit = str(ob.get("credit_usage") or "none")

    lit = str(ob.get("literacy_preference") or "standard")
    if lit not in ("minimal", "standard"):
        lit = "standard"

    secondary = "cash"
    if credit in ("informal", "formal"):
        secondary = "credit"
    elif revenue_model == "product" and inv != "none":
        secondary = "inventory"
    elif revenue_model == "service":
        secondary = "service"

    show_inv = revenue_model == "product" and inv != "none"
    show_svc = revenue_model == "service"
    show_credit = credit in ("informal", "formal")

    inventory_hint = None
    if show_inv:
        need = 18 + (tick % 12)
        inventory_hint = {
            "headline": "Stock jaldi kam ho sakta hai",
            "sub": f"Kal ke liye ~{need} units mangwana / check karein",
            "cta": "Order karo",
        }

    service_hint = None
    if show_svc:
        svc_load = ["kam", "theek", "zyada"][tick % 3]
        service_hint = {
            "headline": "Kal bookings",
            "sub": f"Kal demand {svc_load} lag rahi hai — slots / calls follow karein.",
        }

    return {
        "mode": "basic",
        "risk_level": risk_level,
        "primary_action": snap.get("action"),
        "secondary_module": secondary,
        "literacy_ui": lit,
        "flags": {
            "show_inventory_strip": show_inv,
            "show_service_booking_hint": show_svc,
            "show_credit_priority_list": show_credit,
            "auto_guided_voice": risk_level == "high",
        },
        "inventory_hint": inventory_hint,
        "service_hint": service_hint,
    }
