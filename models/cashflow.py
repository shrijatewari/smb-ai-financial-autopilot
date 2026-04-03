"""Cash flow from transactions with payment delays."""

from __future__ import annotations

from pathlib import Path

import pandas as pd


def load_transactions(csv_path: str | Path) -> pd.DataFrame:
    path = Path(csv_path)
    df = pd.read_csv(path)
    df["date"] = pd.to_datetime(df["date"])
    df["payment_delay_days"] = df["payment_delay_days"].fillna(0).astype(int)
    return df


def net_by_effective_date(df: pd.DataFrame) -> pd.Series:
    """Aggregate cash impact on the day cash actually moves."""
    d = df.copy()
    d["effective_date"] = d["date"] + pd.to_timedelta(d["payment_delay_days"], unit="D")
    by_day = d.groupby("effective_date", sort=True)["amount"].sum()
    return by_day


def daily_cash_balance(
    df: pd.DataFrame,
    initial_cash: float = 10_000.0,
) -> pd.Series:
    """Running cash balance on a daily calendar (fills missing days with 0 net)."""
    by_day = net_by_effective_date(df)
    if by_day.empty:
        return pd.Series(dtype=float)
    idx = pd.date_range(by_day.index.min(), by_day.index.max(), freq="D")
    daily_net = by_day.reindex(idx, fill_value=0.0)
    return initial_cash + daily_net.cumsum()


def projected_net_series(
    balance: pd.Series,
    horizon_days: int,
    mean_daily_net: float,
) -> pd.Series:
    """Deterministic forecast: flat mean daily change (for 'after' stability demo)."""
    if balance.empty:
        last = 0.0
    else:
        last = float(balance.iloc[-1])
    last_date = balance.index[-1] if len(balance) else pd.Timestamp.today().normalize()
    future_idx = pd.date_range(last_date + pd.Timedelta(days=1), periods=horizon_days, freq="D")
    changes = pd.Series(mean_daily_net, index=future_idx)
    return last + changes.cumsum()
