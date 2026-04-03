"""Feature extraction for credit risk, reconstruction, and anomaly context."""

from __future__ import annotations

import numpy as np
import pandas as pd


def delay_frequency_score(df: pd.DataFrame) -> float:
    """
    Proxy for payment delay frequency from day gaps between inflows (higher = more irregular).
    """
    if df.empty or "date" not in df.columns:
        return 0.0
    d = df.sort_values("date").copy()
    d["day"] = pd.to_datetime(d["date"]).dt.normalize()
    if "amount_signed" not in d.columns:
        return 0.0
    pos_days = d.loc[d["amount_signed"] > 0, "day"].unique()
    if len(pos_days) < 2:
        return 0.0
    pos_days = np.sort(pos_days)
    gaps = np.diff(pos_days.astype("datetime64[D]").astype(int))
    if len(gaps) == 0:
        return 0.0
    return float(min(1.0, np.std(gaps) / (np.mean(gaps) + 1e-6)))


def repayment_consistency_score(df: pd.DataFrame) -> float:
    """
    Inflow stability: 1 - normalized coefficient of variation of positive daily totals.
    """
    if df.empty or "amount_signed" not in df.columns:
        return 0.5
    d = df.copy()
    d["day"] = pd.to_datetime(d["date"]).dt.normalize()
    daily_in = d.loc[d["amount_signed"] > 0].groupby("day")["amount_signed"].sum()
    if len(daily_in) < 2:
        return 0.5
    mu = float(daily_in.mean())
    sd = float(daily_in.std(ddof=1))
    cv = sd / (abs(mu) + 1e-6)
    return float(max(0.0, min(1.0, 1.0 - min(cv, 3.0) / 3.0)))


def transaction_volatility_score(df: pd.DataFrame) -> float:
    """Normalized volatility of signed amounts (0–1, higher = more volatile)."""
    if df.empty or "amount_signed" not in df.columns:
        return 0.0
    x = df["amount_signed"].astype(float).values
    if len(x) < 2:
        return 0.0
    mu = float(np.mean(np.abs(x)))
    sd = float(np.std(x, ddof=1))
    return float(min(1.0, sd / (mu + 1e-6)))


def build_credit_feature_vector(df: pd.DataFrame) -> np.ndarray:
    """Single-row feature vector for logistic credit model."""
    return np.array(
        [
            delay_frequency_score(df),
            repayment_consistency_score(df),
            transaction_volatility_score(df),
        ],
        dtype=float,
    ).reshape(1, -1)
