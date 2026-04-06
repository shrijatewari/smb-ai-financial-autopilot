"""Rule-based decision layer over risk, credit, and cash metrics."""

from __future__ import annotations

from typing import Any

from utils.constants import ACTION_TRIGGER_THRESHOLD, CASH_RISK_ALERT_THRESHOLD, CREDIT_LINE_RISK_FLOOR


def build_actions(
    probability_of_negative_cash: float,
    default_probability: float,
    receivable_exposure: float,
    min_cash: float,
) -> list[dict[str, Any]]:
    """
    Emit structured actions when thresholds are crossed.
    """
    actions: list[dict[str, Any]] = []

    if probability_of_negative_cash > CASH_RISK_ALERT_THRESHOLD:
        sug_amount = round(max(1000.0, receivable_exposure * 0.12), 2)
        actions.append(
            {
                "action": "collect_payment",
                "priority": "high" if probability_of_negative_cash > ACTION_TRIGGER_THRESHOLD else "medium",
                "reason": (
                    "Cash runway is tight – collect overdue receivables today before inflows slip further."
                ),
                "confidence": min(0.95, 0.55 + 0.45 * probability_of_negative_cash),
                "metadata": {
                    "risk_signal": "liquidity_shortfall",
                    "worst_case_cash": min_cash,
                    "suggested_amount": sug_amount,
                    "customer": "Top overdue",
                },
            }
        )
        actions.append(
            {
                "action": "reduce_expense",
                "priority": "medium",
                "reason": "Tighten discretionary and supplier spend until cash runway stabilizes.",
                "confidence": 0.72,
                "metadata": {"risk_signal": "expense_pressure"},
            }
        )

    if default_probability > CREDIT_LINE_RISK_FLOOR and receivable_exposure > 0:
        actions.append(
            {
                "action": "offer_credit_line",
                "priority": "medium",
                "reason": "Working-capital line can bridge receivable lag while default risk remains bounded.",
                "confidence": min(0.88, 0.5 + 0.5 * (1.0 - default_probability)),
                "metadata": {
                    "default_probability": default_probability,
                    "receivable_exposure": receivable_exposure,
                },
            }
        )

    if probability_of_negative_cash > ACTION_TRIGGER_THRESHOLD and min_cash < 0:
        actions.append(
            {
                "action": "delay_payable",
                "priority": "high",
                "reason": "Stress paths breach zero cash; defer non-critical payables within policy limits.",
                "confidence": 0.78,
                "metadata": {"worst_case_cash": min_cash},
            }
        )

    return actions


def risk_explanation(
    probability_of_negative_cash: float,
    horizon_days: int,
    default_probability: float,
    volatility_hint: float,
) -> str:
    """Single-sentence executive summary for API consumers."""
    return (
        f"There is a {100 * probability_of_negative_cash:.1f}% probability of cash shortage in the next "
        f"{horizon_days} days due to delayed receivables and "
        f"{'high' if volatility_hint > 0.45 else 'moderate'} expense volatility; "
        f"credit stress indicator is at {100 * default_probability:.1f}%."
    )
