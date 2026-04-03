"""Running cash balance from ordered transactions."""

from __future__ import annotations

import pandas as pd


def compute_running_balance(df: pd.DataFrame, initial_balance: float = 0.0) -> pd.DataFrame:
    """
    Sort by date, then compute cumulative balance.

    Expects columns: date, amount_signed (or will use helpers).
    Adds column `balance`.
    """
    d = df.copy()
    if "amount_signed" not in d.columns:
        raise ValueError("DataFrame must have amount_signed; run helpers.apply_signed_amounts first")

    d = d.sort_values("date").reset_index(drop=True)
    d["balance"] = initial_balance + d["amount_signed"].cumsum()
    return d
