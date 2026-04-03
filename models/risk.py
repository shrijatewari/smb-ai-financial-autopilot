"""Monte Carlo cash risk simulation."""

from __future__ import annotations

import numpy as np
import pandas as pd


def _daily_net_from_balance(balance: pd.Series) -> np.ndarray:
    if len(balance) < 2:
        return np.array([0.0])
    return balance.diff().dropna().to_numpy()


def forecast_mean_std(balance: pd.Series) -> tuple[float, float]:
    nets = _daily_net_from_balance(balance)
    if len(nets) == 0:
        return 0.0, 1.0
    mean = float(np.mean(nets))
    std = float(np.std(nets, ddof=1)) if len(nets) > 1 else float(abs(nets[0]) or 1.0)
    std = max(std, 1e-6)
    return mean, std


def monte_carlo_shortage(
    balance: pd.Series,
    horizon_days: int,
    n_runs: int = 1000,
    random_state: int | None = 42,
) -> dict:
    """
    Simulate end-of-horizon cash starting from last known balance.
    Returns simulations, probability any day in path goes below zero, and path minima.
    """
    rng = np.random.default_rng(random_state)
    if balance.empty:
        start = 0.0
    else:
        start = float(balance.iloc[-1])
    mean, std = forecast_mean_std(balance)

    # correlated path: cumulative sum of daily shocks
    shocks = rng.normal(mean, std, size=(n_runs, horizon_days))
    paths = start + np.cumsum(shocks, axis=1)
    min_along_path = np.min(paths, axis=1)
    end_cash = paths[:, -1]

    prob_shortage = float(np.mean(min_along_path < 0))
    prob_negative_end = float(np.mean(end_cash < 0))

    return {
        "end_cash_simulations": end_cash,
        "min_along_path": min_along_path,
        "probability_shortage_any_day": prob_shortage,
        "probability_negative_end": prob_negative_end,
        "mean_daily_net": mean,
        "std_daily_net": std,
        "paths_sample": paths[: min(50, n_runs)],  # for optional visualization
    }
