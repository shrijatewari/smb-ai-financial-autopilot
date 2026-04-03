"""Estimate unobserved cash revenue from digital ledger gaps and patterns."""

from __future__ import annotations

import numpy as np
import pandas as pd

from utils.constants import MAX_CONFIDENCE_CEILING, MIN_CONFIDENCE_FLOOR


def estimate_missing_cash_revenue(df: pd.DataFrame) -> dict[str, float | int]:
    """
    True Revenue ≈ Observed Digital Revenue + Estimated Missing Cash.

    Uses average inflow size, inter-arrival gaps vs median gap, and simple anomaly slack.
    """
    if df.empty or "amount_signed" not in df.columns:
        return {
            "observed_revenue": 0.0,
            "estimated_cash": 0.0,
            "total_revenue": 0.0,
            "confidence": MIN_CONFIDENCE_FLOOR,
            "basis": "insufficient_history",
        }

    d = df.copy()
    d["day"] = pd.to_datetime(d["date"]).dt.normalize()
    inflows = d.loc[d["amount_signed"] > 0, "amount_signed"].astype(float)
    observed_revenue = float(inflows.sum()) if len(inflows) else 0.0

    pos = d[d["amount_signed"] > 0].sort_values("date")
    if len(pos) < 2:
        gap_factor = 0.15
        vol_penalty = 0.1
    else:
        gaps = pos["day"].diff().dt.days.dropna().astype(float)
        med_gap = float(np.median(gaps)) if len(gaps) else 7.0
        mean_gap = float(np.mean(gaps))
        gap_ratio = mean_gap / (med_gap + 1e-6)
        gap_factor = float(min(0.45, max(0.05, (gap_ratio - 1.0) * 0.2)))

        amt_std = float(inflows.std(ddof=1)) if len(inflows) > 1 else 0.0
        amt_mean = float(inflows.mean()) if len(inflows) else 1.0
        vol_penalty = float(min(0.25, amt_std / (amt_mean + 1e-6) * 0.12))

    avg_inflow = float(inflows.mean()) if len(inflows) else 0.0
    n_days = max(1, int((d["day"].max() - d["day"].min()).days) + 1)
    implied_daily = observed_revenue / n_days

    # Estimated cash: scaled by structural under-reporting prior for SMB cash-heavy mix
    structural_prior = 0.12 + gap_factor + vol_penalty
    structural_prior = float(min(0.55, structural_prior))

    estimated_cash = observed_revenue * structural_prior + implied_daily * avg_inflow / (avg_inflow + 1e-6) * 0.02 * n_days
    total_revenue = observed_revenue + max(0.0, estimated_cash)

    confidence = 1.0 - min(0.85, gap_factor * 2.0 + vol_penalty * 2.0 + (0.08 if len(inflows) < 8 else 0.0))
    confidence = float(max(MIN_CONFIDENCE_FLOOR, min(MAX_CONFIDENCE_CEILING, confidence)))

    return {
        "observed_revenue": round(observed_revenue, 2),
        "estimated_cash": round(float(estimated_cash), 2),
        "total_revenue": round(float(total_revenue), 2),
        "confidence": confidence,
        "basis": "gap_and_volatility_adjusted",
    }
