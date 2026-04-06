"""
Task-oriented voice/text assistant: intent → simulation / cashflow / decision engines.

Intents distinguish receivables (who owes you) vs payables (who you must pay) vs cash vs risk.
Answers use live collection_queue from global snapshot when available.
"""

from __future__ import annotations

import re
from typing import Any

from services.financial_pipeline import run_full_pipeline
from state.global_state import get_snapshot

# Keyword buckets (after phrase routing for payables / receivables)
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
        "how much cash",
        "how much money",
        "runway",
        "liquidity",
        "rupees",
        "inr",
        "bank",
        "my balance",
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
    "receivables": [
        "collect",
        "receivable",
        "pending from",
        "invoice",
        "customer",
        "who owes",
        "owed to me",
    ],
}


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower().strip())


def _match_payables(q: str) -> bool:
    """Money going OUT – suppliers, vendors, whom I pay."""
    patterns = [
        r"who (do|should|must) i (need to )?pay",
        r"whom (should i|to )?pay",
        r"who(m)? to pay",
        r"pay (money )?to (whom|who)",
        r"give money to",
        r"have to give money",
        r"(to )?whom.*(give|send) money",
        r"suppliers?.*pay",
        r"pay (the )?supplier",
        r"outgoing",
        r"payables?",
        r"vendor.*pay",
        r"bills? to pay",
        r"whom (do )?i (need to )?(give|pay)",
        r"who do i owe",
        r"i owe money",
        r"owe money to",
    ]
    return any(re.search(p, q) for p in patterns)


def _match_receivables(q: str) -> bool:
    """Money coming IN – customers who owe you."""
    patterns = [
        r"who owes",
        r"who should pay me",
        r"collect (from|money|payment)",
        r"receivable",
        r"from whom.*(collect|take|receive|get)",
        r"(take|receive|get) money from",
        r"who.*(give|send) me money",
        r"money (to )?(get|receive|collect)",
        r"outstanding from",
        r"who all.*(owe|pay) me",
        r"khata.*(collect|receive)",
        r"from whom.*(take|get) money",
        r"money from whom",
        r"who (all )?do i (need to )?(collect|take)",
    ]
    return any(re.search(p, q) for p in patterns)


def _match_off_topic(q: str) -> bool:
    return bool(
        re.search(
            r"\b(play|song|songs|music|spotify|youtube|movie|movies|weather|joke|sports?|cricket)\b",
            q,
        )
    )


def classify_intent(query: str) -> str:
    """Return intent key. Phrase checks run first so payables ≠ receivables ≠ cash."""
    q = _normalize(query)
    if not q:
        return "action"

    if _match_off_topic(q):
        return "off_topic"
    if _match_payables(q):
        return "payables"
    if _match_receivables(q):
        return "receivables"

    scores: dict[str, int] = {k: 0 for k in INTENTS}
    for intent, keywords in INTENTS.items():
        for kw in keywords:
            if kw in q:
                scores[intent] += len(kw)

    best = max(scores.values())
    if best == 0:
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


def _queue_summary_lines(queue: list[dict[str, Any]], max_rows: int = 5) -> list[str]:
    lines: list[str] = []
    for i, row in enumerate((queue or [])[:max_rows], start=1):
        name = str(row.get("name") or "?")
        amt = row.get("amount")
        late = row.get("days_late")
        pr = str(row.get("priority") or "")
        try:
            amt_s = f"₹{float(amt):,.0f}"
        except (TypeError, ValueError):
            amt_s = str(amt)
        late_s = f"{late} days late" if late is not None else "due"
        lines.append(f"{i}) {name} – {amt_s}, {late_s} ({pr} priority)".strip())
    return lines


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

    snap = get_snapshot()
    daily = snap.get("daily_control") or {}
    queue = daily.get("collection_queue") or []

    pct = round(100 * risk_p, 1)

    if intent == "off_topic":
        response = (
            "I only help with your shop's cash, risk, and dues – who owes you, "
            "what to collect, and when cash may get tight. Ask in Hindi or English."
        )
        data: dict[str, Any] = {"hint": "finance_scope"}
        return {"intent": intent, "response": response, "data": data}

    if intent == "receivables":
        lines = _queue_summary_lines(queue)
        if lines:
            response = (
                "People who owe you (from your collection list right now): "
                + " ; ".join(lines)
                + f" Overall cash stress in the next {horizon} days is about {pct}% – chase the top names first."
            )
        else:
            collect = next((a for a in actions if a.get("action") == "collect_payment"), None)
            if collect:
                meta = collect.get("metadata") or {}
                amt = float(meta.get("suggested_amount") or 0)
                cust = str(meta.get("customer") or "your customer")
                response = (
                    f"Priority collection: about ₹{amt:,.0f} from {cust}. "
                    f"Cash risk over {horizon} days is around {pct}%."
                )
            else:
                response = (
                    f"No names in the queue snapshot – current cash is about ₹{current:,.0f}. "
                    f"Connect ledger / SMS so we can list who owes you."
                )
        data = {
            "collection_queue": queue[:5],
            "probability_of_negative_cash": risk_p,
        }
        return {"intent": intent, "response": response, "data": data}

    if intent == "payables":
        delay = next((a for a in actions if a.get("action") == "delay_payable"), None)
        reduce_e = next((a for a in actions if a.get("action") == "reduce_expense"), None)
        tips: list[str] = [
            "This app tracks incoming dues (customers who owe you) clearly. "
            "It does not list every supplier name unless you add that data."
        ]
        if delay:
            tips.append(str(delay.get("reason") or "Defer non-critical supplier payments if cash is tight."))
        elif reduce_e:
            tips.append(str(reduce_e.get("reason") or "Cut discretionary spend until cash stabilizes."))
        else:
            tips.append(
                f"If cash is tight, prioritize rent and wages first, then delay non-urgent supplier bills. "
                f"Cash risk next {horizon} days: about {pct}%."
            )
        response = " ".join(tips)
        data = {
            "probability_of_negative_cash": risk_p,
            "actions": [a for a in actions if a.get("action") in ("delay_payable", "reduce_expense")],
        }
        return {"intent": intent, "response": response, "data": data}

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
