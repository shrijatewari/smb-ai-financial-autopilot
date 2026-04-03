"""
Monte Carlo simulation of future cash paths.

Estimates revenue (inflow) mean/std from historical daily inflows, simulates
daily revenue with a normal distribution, and applies variable daily expenses
(±10–20%) derived from historical expense patterns.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def _daily_inflows_and_expenses(df: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    """
    Aggregate signed transactions into per-calendar-day total inflow (>=0) and
    total expense magnitude (>=0). Missing days are not in the arrays; we use
    only days with activity for distribution fitting, then pad stats with zeros
    where needed.
    """
    if df.empty:
        return np.array([0.0]), np.array([0.0])

    d = df.sort_values("date").copy()
    d["day"] = pd.to_datetime(d["date"]).dt.normalize()

    inflows: list[float] = []
    expenses: list[float] = []
    for _, grp in d.groupby("day", sort=True):
        pos = grp.loc[grp["amount_signed"] > 0, "amount_signed"]
        neg = grp.loc[grp["amount_signed"] < 0, "amount_signed"]
        inflows.append(float(pos.sum()) if len(pos) else 0.0)
        expenses.append(float(-neg.sum()) if len(neg) else 0.0)

    return np.asarray(inflows, dtype=float), np.asarray(expenses, dtype=float)


def _moments(x: np.ndarray) -> tuple[float, float]:
    x = np.asarray(x, dtype=float)
    if len(x) == 0:
        return 0.0, 1.0
    mu = float(np.mean(x))
    sigma = float(np.std(x, ddof=1)) if len(x) > 1 else max(abs(mu), 1.0)
    return mu, max(sigma, 1e-6)


def run_monte_carlo(
    df: pd.DataFrame,
    last_balance: float,
    horizon_days: int = 30,
    n_scenarios: int = 1000,
    random_state: int | None = 42,
    gst_payment_amount: float | None = None,
    gst_payment_day: int | None = None,
) -> dict:
    """
    Simulate futures using:
      - daily revenue ~ Normal(mu_inflow, sigma_inflow) clipped at 0
      - daily expense ~ base_expense * Uniform(0.8, 1.2)  (±10–20% around mean expense)

    Returns:
        risk_probability: P(any simulated balance < 0 along the horizon)
        min_cash: worst simulated balance across all paths and days
        max_cash: best simulated balance across all paths and days
        future_balances: list of paths (each path length = horizon_days)
    """
    rng = np.random.default_rng(random_state)

    inflows, expenses = _daily_inflows_and_expenses(df)
    mu_rev, sigma_rev = _moments(inflows)
    base_expense = float(np.mean(expenses)) if len(expenses) else 100.0
    base_expense = max(base_expense, 1.0)

    # n_scenarios x horizon_days matrices
    revenue = rng.normal(mu_rev, sigma_rev, size=(n_scenarios, horizon_days))
    revenue = np.maximum(revenue, 0.0)

    # Expense variability ±10–20%: scale base daily expense per day & scenario
    expense_scales = rng.uniform(0.8, 1.2, size=(n_scenarios, horizon_days))
    daily_expense = base_expense * expense_scales

    net_daily = revenue - daily_expense
    paths = last_balance + np.cumsum(net_daily, axis=1)

    if gst_payment_amount and gst_payment_amount > 0 and gst_payment_day is not None:
        d = int(gst_payment_day)
        if 0 <= d < horizon_days:
            paths[:, d:] -= float(gst_payment_amount)

    min_along_paths = np.min(paths, axis=1)
    risk_probability = float(np.mean(min_along_paths < 0))
    min_cash = float(np.min(paths))
    max_cash = float(np.max(paths))

    future_balances = [row.tolist() for row in paths]

    return {
        "risk_probability": risk_probability,
        "min_cash": min_cash,
        "max_cash": max_cash,
        "future_balances": future_balances,
    }
