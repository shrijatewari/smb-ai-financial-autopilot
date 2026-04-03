"""
Amount-based anomaly detection using z-scores on absolute transaction sizes.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

Z_THRESHOLD = 3.0


def annotate_transactions(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add columns: z_score (on |amount|), is_suspicious (|z| > threshold).
    """
    if df.empty:
        out = df.copy()
        out["z_score"] = pd.Series(dtype=float)
        out["is_suspicious"] = pd.Series(dtype=bool)
        return out

    out = df.copy()
    amt = out["amount"].abs().astype(float)
    if len(amt) < 2:
        out["z_score"] = 0.0
        out["is_suspicious"] = False
        return out
    mu = float(amt.mean())
    sigma = max(float(amt.std(ddof=1)), 1e-6)
    z = (amt - mu) / sigma
    out["z_score"] = z
    out["is_suspicious"] = z.abs() > Z_THRESHOLD
    return out


def fraud_summary(df: pd.DataFrame) -> dict:
    """Counts and max z for API payloads."""
    if df.empty or "is_suspicious" not in df.columns:
        return {"flagged_count": 0, "max_abs_z": 0.0}
    return {
        "flagged_count": int(df["is_suspicious"].sum()),
        "max_abs_z": float(df["z_score"].abs().max()) if len(df) else 0.0,
    }
