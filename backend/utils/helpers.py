"""Shared helpers for parsing amounts, dates, and normalizing CSV columns."""

from __future__ import annotations

import pandas as pd


def normalize_type_column(series: pd.Series) -> pd.Series:
    """Lowercase and strip type values (credit/debit)."""
    return series.astype(str).str.strip().str.lower()


def signed_amount(row: pd.Series) -> float:
    """
    Convert positive amount + type into signed cash impact.
    Credit = inflow (+), debit = outflow (-).
    """
    amt = float(abs(row["amount"]))
    t = str(row["type_normalized"]).lower()
    if t in ("credit", "cr", "c"):
        return amt
    if t in ("debit", "dr", "d"):
        return -amt
    raise ValueError(f"Unknown transaction type: {row.get('type')}")


def apply_signed_amounts(df: pd.DataFrame) -> pd.DataFrame:
    """Add column amount_signed for cash-flow math."""
    out = df.copy()
    if "type_normalized" not in out.columns:
        out["type_normalized"] = normalize_type_column(out["type"])
    out["amount_signed"] = out.apply(signed_amount, axis=1)
    return out


def parse_dates(df: pd.DataFrame, col: str = "date") -> pd.DataFrame:
    out = df.copy()
    out[col] = pd.to_datetime(out[col], errors="coerce")
    return out
