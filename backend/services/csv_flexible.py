"""
Map messy bank / Paytm-style CSV exports into the canonical schema:
date, amount, type (credit|debit), description.
"""

from __future__ import annotations

import re
from typing import Any

import pandas as pd

_DATE_ALIASES = (
    "date",
    "txn_date",
    "transaction_date",
    "value date",
    "value_date",
    "post_date",
    "transaction date",
    "txn date",
)
_DESC_ALIASES = (
    "description",
    "narration",
    "particulars",
    "remarks",
    "details",
    "memo",
    "payee",
    "payee name",
    "merchant",
    "counterparty",
)
_TYPE_ALIASES = ("type", "dr_cr", "dr/cr", "cr_dr", "transaction_type")

_DEBIT_ALIASES = ("debit", "withdrawal", "withdrawals", "dr", "paid_out")
_CREDIT_ALIASES = ("credit", "deposit", "deposits", "cr", "received")


def _norm_col(c: str) -> str:
    return re.sub(r"\s+", " ", str(c).lower().strip())


def _find_column(df: pd.DataFrame, aliases: tuple[str, ...]) -> str | None:
    mapping = {_norm_col(c): c for c in df.columns}
    for a in aliases:
        if a in mapping:
            return mapping[a]
    for c in df.columns:
        nc = _norm_col(c)
        if nc in aliases:
            return c
    return None


def _parse_numeric_series(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s.astype(str).str.replace(",", "", regex=False), errors="coerce")


def flexible_csv_to_standard(df: pd.DataFrame) -> pd.DataFrame:
    """
    Produce columns: date, amount, type, description.
    Raises ValueError if the structure cannot be interpreted.
    """
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]

    c_date = _find_column(df, _DATE_ALIASES)
    c_desc = _find_column(df, _DESC_ALIASES)
    c_type = _find_column(df, _TYPE_ALIASES)
    c_amt = _find_column(df, ("amount", "amt", "transaction amount", "value"))
    c_debit = _find_column(df, _DEBIT_ALIASES)
    c_credit = _find_column(df, _CREDIT_ALIASES)

    # Standard path: date + amount + type + description
    if c_date and c_amt and c_type:
        desc = df[c_desc].astype(str) if c_desc else pd.Series([""] * len(df), index=df.index)
        out = pd.DataFrame(
            {
                "date": df[c_date],
                "amount": _parse_numeric_series(df[c_amt]),
                "type": df[c_type].astype(str).str.strip().str.lower(),
                "description": desc,
            }
        )
        out["type"] = out["type"].replace(
            {"dr": "debit", "cr": "credit", "d": "debit", "c": "credit"}
        )
        return out

    # Debit / credit split columns (common in bank statements)
    if c_date and (c_debit is not None or c_credit is not None):
        if not c_desc:
            c_desc = c_date
        rows: list[dict[str, Any]] = []
        for _, r in df.iterrows():
            d_raw = r[c_date]
            desc = str(r[c_desc]) if c_desc else ""
            dr = (
                float(_parse_numeric_series(pd.Series([r[c_debit]])).iloc[0])
                if c_debit is not None
                else 0.0
            )
            cr = (
                float(_parse_numeric_series(pd.Series([r[c_credit]])).iloc[0])
                if c_credit is not None
                else 0.0
            )
            if pd.isna(dr):
                dr = 0.0
            if pd.isna(cr):
                cr = 0.0
            if pd.notna(dr) and float(dr) > 0:
                rows.append(
                    {
                        "date": d_raw,
                        "amount": float(dr),
                        "type": "debit",
                        "description": desc,
                    }
                )
            if pd.notna(cr) and float(cr) > 0:
                rows.append(
                    {
                        "date": d_raw,
                        "amount": float(cr),
                        "type": "credit",
                        "description": desc,
                    }
                )
        if not rows:
            raise ValueError("No debit/credit amounts found in CSV")
        out = pd.DataFrame(rows)
        return out

    # Single amount column + inferred type from sign or separate column
    if c_date and c_amt:
        if not c_desc:
            c_desc = c_amt
        amt = _parse_numeric_series(df[c_amt])
        typ = df[c_type].astype(str).str.strip().str.lower() if c_type else None
        if typ is None:
            tlist = []
            for a in amt:
                if pd.isna(a):
                    tlist.append("debit")
                else:
                    tlist.append("credit" if float(a) >= 0 else "debit")
            typ = pd.Series(tlist, index=df.index)
        if c_desc == c_amt:
            desc = pd.Series([""] * len(df), index=df.index)
        else:
            desc = df[c_desc].astype(str)
        out = pd.DataFrame(
            {
                "date": df[c_date],
                "amount": amt.abs(),
                "type": typ,
                "description": desc,
            }
        )
        out["type"] = out["type"].replace(
            {"dr": "debit", "cr": "credit", "d": "debit", "c": "credit"}
        )
        return out

    raise ValueError(
        "Could not detect CSV layout. Expected columns like: date, amount, type, description "
        "OR date with debit/credit columns OR date with amount and type."
    )
