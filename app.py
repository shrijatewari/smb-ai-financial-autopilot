#!/usr/bin/env python3
"""CLI demo: load CSV, run cash / risk / credit, export graphs."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
os.environ.setdefault("MPLCONFIGDIR", str(ROOT / ".mplconfig"))

import numpy as np

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from graphs.plots import save_all_demo_plots
from models.cashflow import daily_cash_balance, load_transactions, projected_net_series
from models.credit import CreditRiskModel, transaction_features
from models.risk import forecast_mean_std, monte_carlo_shortage


def build_forecast_band(balance, horizon: int):
    mean, std = forecast_mean_std(balance)
    start = float(balance.iloc[-1]) if len(balance) else 0.0
    x = np.arange(1, horizon + 1)
    path_mean = start + mean * x
    lower = start + (mean - std) * x
    upper = start + (mean + std) * x
    return x, path_mean, lower, upper


def main() -> None:
    parser = argparse.ArgumentParser(description="SMB financial intelligence demo")
    parser.add_argument(
        "--data",
        default=str(ROOT / "data" / "sample_transactions.csv"),
        help="Path to transactions CSV",
    )
    parser.add_argument("--initial-cash", type=float, default=12_000.0)
    parser.add_argument("--horizon", type=int, default=10)
    parser.add_argument("--mc-runs", type=int, default=1000)
    parser.add_argument("--graphs-dir", default=str(ROOT / "graphs" / "output"))
    args = parser.parse_args()

    df = load_transactions(args.data)
    balance = daily_cash_balance(df, initial_cash=args.initial_cash)

    mc = monte_carlo_shortage(balance, horizon_days=args.horizon, n_runs=args.mc_runs)
    fx, fmean, flower, fupper = build_forecast_band(balance, args.horizon)

    _, std = forecast_mean_std(balance)
    stable_daily = max(float(np.mean(balance.diff().dropna())), 0.0) + std * 0.15
    after_path = projected_net_series(balance, args.horizon, mean_daily_net=stable_daily)
    before_x = np.arange(1, len(balance) + 1)
    before_y = balance.values.astype(float)
    after_x = np.arange(len(balance) + 1, len(balance) + 1 + args.horizon)
    after_y = after_path.values.astype(float)

    feats = transaction_features(df, balance)
    credit = CreditRiskModel()
    p_default = credit.default_probability(feats)
    band = credit.risk_band(p_default)

    paths = save_all_demo_plots(
        balance,
        args.horizon,
        mc["end_cash_simulations"],
        fx,
        fmean,
        flower,
        fupper,
        before_x,
        before_y,
        after_x,
        after_y,
        out_dir=args.graphs_dir,
    )

    pct = 100 * mc["probability_shortage_any_day"]
    print("SMB Financial Intelligence – demo run")
    print("-" * 44)
    print(f"Rows loaded: {len(df)}")
    print(f"Ending cash (historical): {balance.iloc[-1]:,.2f}")
    print(f"Monte Carlo runs: {args.mc_runs}, horizon: {args.horizon} days")
    print(
        f"Estimated probability of hitting cash shortage (any day): {pct:.1f}%"
    )
    print(
        f"Probability negative cash at horizon: {100 * mc['probability_negative_end']:.1f}%"
    )
    print(f"Credit default risk (logistic, calibrated): {100 * p_default:.1f}% – {band} band")
    print("Graphs saved:")
    for k, p in paths.items():
        print(f"  {k}: {p}")


if __name__ == "__main__":
    main()
