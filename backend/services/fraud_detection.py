"""Anomaly detection: spikes, duplicates, and abnormal inter-arrival timing."""

from __future__ import annotations

import numpy as np
import pandas as pd

from services.fraud_service import annotate_transactions, fraud_summary


def analyze(df: pd.DataFrame) -> dict:
    """
    Layer z-score based flags with duplicate-amount and burst-timing heuristics.
    """
    if df.empty:
        return {"flags": [], "fraud_summary": {"flagged_count": 0, "max_abs_z": 0.0}}

    d = annotate_transactions(df.copy())
    base = fraud_summary(d)

    extra_flags: list[str] = []
    amt = d["amount"].abs().astype(float)
    if len(amt) > 2:
        dup_mask = amt.duplicated(keep=False) & (amt > 0)
        if dup_mask.any():
            extra_flags.append(
                f"Repeated identical transaction magnitudes detected ({int(dup_mask.sum())} rows)."
            )

    ts = pd.to_datetime(d["date"])
    if len(ts) > 3:
        delta = ts.sort_values().diff().dt.total_seconds().dropna()
        if len(delta) and float(delta.min()) < 60 and float(amt.max()) > float(amt.median()) * 5:
            extra_flags.append("Abnormal timing: large value within minutes of adjacent activity.")

    z = d.get("z_score")
    if z is not None and float(z.abs().max()) > 3.0:
        extra_flags.append("Amount spike relative to rolling transaction distribution.")

    return {
        "flags": extra_flags,
        "fraud_summary": base,
        "dataframe": d,
    }
