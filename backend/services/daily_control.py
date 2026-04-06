"""Daily control plane: runway, collection queue, action outcome estimates (demo-grade)."""

from __future__ import annotations

from typing import Any


def days_until_negative_cash(paths: list[list[float]] | None, threshold_fraction: float = 0.32) -> int | None:
    """
    First day index (1-based) where at least `threshold_fraction` of simulated paths dip below zero.
    """
    paths = [p for p in (paths or []) if p and len(p) > 0]
    if not paths:
        return None
    depth = len(paths[0])
    n = len(paths)
    for d in range(depth):
        below = sum(1 for p in paths if float(p[d]) < 0.0)
        if below / n >= threshold_fraction:
            return d + 1
    return None


def build_collection_queue(receivable_exposure: float, tick: int) -> list[dict[str, Any]]:
    """
    Top-3 collection priorities (deterministic from tick + exposure for stable demos).
    """
    base = max(1200.0, min(85_000.0, receivable_exposure * 0.08 + 800.0))
    rng = (tick % 97) / 97.0
    rows = [
        {
            "name": "Ramesh",
            "amount": round(base * (1.0 + 0.12 * rng), 0),
            "days_late": 5,
            "priority": "high",
            "note": "UPI pending · repeat buyer",
        },
        {
            "name": "Priya",
            "amount": round(base * 0.62, 0),
            "days_late": 3,
            "priority": "medium",
            "note": "Salon package · verbal promise",
        },
        {
            "name": "Suresh",
            "amount": round(base * 0.41, 0),
            "days_late": 1,
            "priority": "medium",
            "note": "Supplier advance adjustment",
        },
        {
            "name": "Neha",
            "amount": round(base * 0.35, 0),
            "days_late": 2,
            "priority": "medium",
            "note": "Credit sale · kirana",
        },
        {
            "name": "Vikram",
            "amount": round(base * 0.28, 0),
            "days_late": 4,
            "priority": "low",
            "note": "Wholesale partial",
        },
    ]
    rows.sort(key=lambda r: (-{"high": 3, "medium": 2, "low": 1}[r["priority"]], r["days_late"]))
    return rows[:5]


def estimate_action_outcomes(
    risk: float,
    suggested_collect_inr: float,
    receivable_exposure: float,
) -> dict[str, Any]:
    """
    Simple before/after risk labels for the UI (not a second Monte Carlo run).
    """
    # Heuristic deltas – tuned to read well in demos
    collect_delta = min(0.55, 0.18 + 0.45 * risk + min(0.12, receivable_exposure / 500_000))
    delay_delta = min(0.25, 0.08 + 0.2 * risk)

    risk_after_collect = max(0.04, risk * (1.0 - collect_delta))
    risk_after_delay = max(0.06, risk * (1.0 - delay_delta))

    return {
        "risk_now": round(risk, 4),
        "if_do_nothing": {
            "label": "cash stress likely" if risk > 0.22 else "slow bleed",
            "risk_stays": round(risk, 4),
            "summary": "No collection – runway keeps shrinking under current volatility.",
        },
        "if_collect": {
            "amount_inr": round(suggested_collect_inr, 0),
            "risk_after": round(risk_after_collect, 4),
            "summary": f"Clearing ~₹{suggested_collect_inr:,.0f} from overdue pulls risk toward safer band.",
        },
        "if_delay_supplier": {
            "risk_after": round(risk_after_delay, 4),
            "summary": "Deferring a non-critical payable buys a few days without chasing customers.",
        },
    }
