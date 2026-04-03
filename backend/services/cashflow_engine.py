"""Cash ledger: running balance with receivable / payable lag parameters for downstream simulation."""

from __future__ import annotations

import pandas as pd

from models.cashflow_model import compute_running_balance
from utils.constants import DEFAULT_PAYABLE_LAG_DAYS, DEFAULT_RECEIVABLE_LAG_DAYS
from utils.helpers import apply_signed_amounts, parse_dates


def compute_ledgers(
    df: pd.DataFrame,
    initial_balance: float,
    receivable_lag_days: float | None = None,
    payable_lag_days: float | None = None,
) -> tuple[pd.DataFrame, dict[str, float]]:
    """
    C_{t+1} = C_t + amount_signed(t).

    Lag days are carried forward to Monte Carlo and narrative layers (settlement friction),
    not applied as a second balance column, to keep a single auditable ledger.
    """
    if df.empty:
        return df, {
            "receivable_lag_days": float(receivable_lag_days or DEFAULT_RECEIVABLE_LAG_DAYS),
            "payable_lag_days": float(payable_lag_days or DEFAULT_PAYABLE_LAG_DAYS),
        }

    d = parse_dates(df.copy())
    if "type_normalized" not in d.columns:
        d["type_normalized"] = d["type"].astype(str).str.strip().str.lower()
    d = apply_signed_amounts(d)
    d = compute_running_balance(d, initial_balance=initial_balance)

    meta = {
        "receivable_lag_days": float(receivable_lag_days if receivable_lag_days is not None else DEFAULT_RECEIVABLE_LAG_DAYS),
        "payable_lag_days": float(payable_lag_days if payable_lag_days is not None else DEFAULT_PAYABLE_LAG_DAYS),
    }
    return d, meta
