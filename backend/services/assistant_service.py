"""
Task-oriented voice/text assistant: intent → simulation / cashflow / decision engines.
"""

from __future__ import annotations

import re
from typing import Any

from services.financial_pipeline import run_full_pipeline

# Keyword buckets (simple overlap scoring; extend for multilingual later)
INTENTS: dict[str, list[str]] = {
    "risk": [
        "risk",
        "danger",
        "loss",
        "shortage",
        "negative",
        "shortfall",
        "probability",
        "stress",
        "worst case",
        "volatile",
    ],
    "cash": [
        "cash",
        "balance",
        "money",
        "how much cash",
        "runway",
        "liquidity",
        "rupees",
        "inr",
        "bank",
    ],
    "action": [
        "what should i do",
        "what can i do",
        "suggest",
        "recommend",
        "advice",
        "next step",
        "help me decide",
        "what to do",
        "priority",
    ],
    "payments": [
        "who should pay",
        "collect",
        "pending",
        "receivable",
        "owe",
        "owed",
        "due",
        "payment",
        "invoice",
        "customer pay",
    ],
}


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower().strip())


def classify_intent(query: str) -> str:
    """Return highest-scoring intent key."""
    q = _normalize(query)
    if not q:
        return "action"

    scores: dict[str, int] = {k: 0 for k in INTENTS}
    for intent, keywords in INTENTS.items():
        for kw in keywords:
            if kw in q:
                scores[intent] += len(kw)

    best = max(scores.values())
    if best == 0:
        # Heuristic: questions about "how" often want actions
        if q.startswith("how ") and any(x in q for x in ("risk", "much", "bad")):
            return "risk" if "risk" in q or "bad" in q else "cash"
        return "action"

    return max(scores, key=lambda k: scores[k])


def parse_horizon_days(query: str, default: int = 30) -> int:
    q = _normalize(query)
    m = re.search(r"next\s+(\d+)\s+days?", q)
    if m:
        return max(5, min(120, int(m.group(1))))
    m2 = re.search(r"(\d+)\s+days?", q)
    if m2:
        return max(5, min(120, int(m2.group(1))))
    return default


def run_assistant(
    query: str,
    *,
    initial_balance: float = 10_000.0,
    horizon_days: int | None = None,
) -> dict[str, Any]:
    """
    Classify intent, run financial pipeline once, return natural-language response + structured data.
    """
    intent = classify_intent(query)
    horizon = horizon_days if horizon_days is not None else parse_horizon_days(query, default=30)

    out = run_full_pipeline(initial_balance=initial_balance, horizon_days=horizon)
    sim = out["simulation"]
    risk_p = float(sim["probability_of_negative_cash"])
    worst = float(sim["worst_case_cash"])
    expected = float(sim["expected_cash"])
    current = float(out["current_cash"])
    actions = out.get("actions") or []
    credit = out.get("credit") or {}

    pct = round(100 * risk_p, 1)

    if intent == "risk":
        response = (
            f"There is about a {pct}% probability of cash shortage at least once in the next {horizon} days "
            f"under the current model. Worst-case path reaches roughly ₹{worst:,.0f}; "
            f"expected ending cash is about ₹{expected:,.0f}."
        )
        data = {
            "probability_of_negative_cash": risk_p,
            "horizon_days": horizon,
            "worst_case_cash": worst,
            "expected_cash": expected,
            "narrative": sim.get("narrative"),
        }

    elif intent == "cash":
        response = (
            f"Your reconstructed cash position is about ₹{current:,.0f}. "
            f"Over the next {horizon} days, simulated ending cash averages ₹{expected:,.0f} "
            f"with a {pct}% chance of dipping below zero at least once."
        )
        data = {
            "current_cash": current,
            "expected_cash": expected,
            "horizon_days": horizon,
            "probability_of_negative_cash": risk_p,
        }

    elif intent == "payments":
        collect = next((a for a in actions if a.get("action") == "collect_payment"), None)
        if collect:
            meta = collect.get("metadata") or {}
            amt = float(meta.get("suggested_amount") or 0)
            cust = str(meta.get("customer") or "your customer")
            response = (
                f"Collections are the priority: consider collecting about ₹{amt:,.0f} from {cust} "
                f"to ease liquidity. Cash risk over {horizon} days is around {pct}%."
            )
            data = {"primary_action": collect, "probability_of_negative_cash": risk_p}
        elif actions:
            a0 = actions[0]
            response = (
                f"Top recommendation: {str(a0.get('action', '')).replace('_', ' ')} — {a0.get('reason', '')}"
            )
            data = {"primary_action": a0}
        else:
            response = (
                f"No urgent collection signal from the model right now. "
                f"Current cash is about ₹{current:,.0f}; risk over {horizon} days is {pct}%."
            )
            data = {"actions": [], "current_cash": current}

    else:  # action (default)
        if not actions:
            response = (
                f"No automated action flagged. Current cash ≈ ₹{current:,.0f}; "
                f"{horizon}-day cash shortage risk ≈ {pct}%."
            )
            data = {"actions": [], "current_cash": current, "risk_probability": risk_p}
        else:
            a0 = actions[0]
            act = str(a0.get("action", "")).replace("_", " ")
            meta = a0.get("metadata") or {}
            reason = str(a0.get("reason", ""))
            if a0.get("action") == "collect_payment":
                amt = float(meta.get("suggested_amount") or 0)
                cust = str(meta.get("customer") or "the primary receivable")
                response = (
                    f"You should {act}: target about ₹{amt:,.0f} from {cust} to reduce cash risk. {reason}"
                )
            else:
                response = f"You should {act}. {reason}"
            data = {
                "primary_action": a0,
                "all_actions": actions[:5],
                "probability_of_negative_cash": risk_p,
                "default_probability": credit.get("default_probability"),
            }

    return {
        "intent": intent,
        "response": response,
        "data": data,
    }
