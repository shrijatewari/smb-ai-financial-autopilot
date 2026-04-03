"""Monte Carlo cash paths: risk metrics, expectations, and narrative output."""

from __future__ import annotations

import numpy as np

from models.simulation import run_monte_carlo
from utils.constants import DEFAULT_MONTE_CARLO_PATHS


def run_simulation(
    prepared_df,
    last_balance: float,
    horizon_days: int = 30,
    n_paths: int | None = None,
    random_state: int | None = 42,
    gst_payment_amount: float | None = None,
    gst_payment_day: int | None = None,
) -> dict:
    """
    Run N stochastic paths; return fintech-style metrics including expected terminal cash.
    """
    n_paths = int(n_paths or DEFAULT_MONTE_CARLO_PATHS)
    n_paths = max(500, min(5000, n_paths))

    raw = run_monte_carlo(
        prepared_df,
        last_balance=last_balance,
        horizon_days=horizon_days,
        n_scenarios=n_paths,
        random_state=random_state,
        gst_payment_amount=gst_payment_amount,
        gst_payment_day=gst_payment_day,
    )
    paths = raw.get("future_balances") or []
    terminal = np.array([p[-1] for p in paths if p], dtype=float)
    expected_cash = float(np.mean(terminal)) if len(terminal) else float(last_balance)

    risk_p = float(raw.get("risk_probability", 0.0))
    min_c = float(raw.get("min_cash", 0.0))
    max_c = float(raw.get("max_cash", 0.0))

    narrative = _build_narrative(
        risk_p=risk_p,
        worst=min_c,
        best=max_c,
        expected=expected_cash,
        horizon=horizon_days,
    )

    return {
        "probability_of_negative_cash": risk_p,
        "worst_case_cash": min_c,
        "best_case_cash": max_c,
        "expected_cash": expected_cash,
        "horizon_days": horizon_days,
        "paths_simulated": n_paths,
        "future_balances": paths,
        "narrative": narrative,
    }


def _build_narrative(
    risk_p: float,
    worst: float,
    best: float,
    expected: float,
    horizon: int,
) -> str:
    parts = [
        f"There is a {100 * risk_p:.1f}% probability of dipping below zero cash at least once "
        f"within the next {horizon} days under the current stochastic revenue and expense model."
    ]
    if worst < 0:
        parts.append(
            f"Stress paths reach a worst-case balance of ₹{worst:,.0f}, while the upper envelope reaches ₹{best:,.0f}."
        )
    parts.append(
        f"Mean simulated ending cash is ₹{expected:,.0f}, comparing against receivable timing and expense volatility assumptions."
    )
    return " ".join(parts)
