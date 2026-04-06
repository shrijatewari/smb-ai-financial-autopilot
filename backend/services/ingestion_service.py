"""CSV upload handling and in-memory session store for the demo API."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from utils.helpers import apply_signed_amounts
from services.csv_flexible import flexible_csv_to_standard

REQUIRED_COLUMNS = {"date", "amount", "type", "description"}

# Last successfully uploaded frame (single-tenant demo store)
_session_df: pd.DataFrame | None = None
# Counts by ingestion channel for trust_score
_source_mix: dict[str, int] = {"csv": 0, "paytm": 0, "sms": 0, "ocr": 0}


def get_source_mix() -> dict[str, int]:
    return dict(_source_mix)


def sync_source_mix_from_df(df: pd.DataFrame) -> None:
    """Recompute channel counts from the `source` column (authoritative)."""
    global _source_mix
    if df is None or df.empty or "source" not in df.columns:
        return
    for k in ("csv", "paytm", "sms", "ocr"):
        _source_mix[k] = int((df["source"] == k).sum())


def reset_source_mix() -> None:
    global _source_mix
    _source_mix = {"csv": 0, "paytm": 0, "sms": 0, "ocr": 0}


def get_session_dataframe() -> pd.DataFrame | None:
    return _session_df.copy() if _session_df is not None else None


def set_session_dataframe(df: pd.DataFrame) -> None:
    global _session_df
    _session_df = df.copy()


def load_csv_from_upload(content: bytes) -> pd.DataFrame:
    """Parse uploaded CSV bytes into a DataFrame."""
    from io import BytesIO

    return pd.read_csv(BytesIO(content))


def validate_and_normalize(df: pd.DataFrame) -> pd.DataFrame:
    """Ensure required columns exist and basic types are sane."""
    df = df.copy()
    df.columns = [str(c).lower().strip() for c in df.columns]
    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ValueError(f"Missing columns: {sorted(missing)}")

    df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
    if df["amount"].isna().any():
        raise ValueError("Invalid numeric values in amount column")

    # Do not use dayfirst=True with ISO YYYY-MM-DD: for a Series, pandas can mis-parse
    # days > 12 and yield NaT (e.g. 2025-10-13). format="mixed" handles ISO + regional CSVs.
    df["date"] = pd.to_datetime(df["date"].astype(str).str.strip(), errors="coerce", format="mixed")
    if df["date"].isna().any():
        raise ValueError("Invalid dates in date column")
    df["date"] = df["date"].dt.strftime("%Y-%m-%d")

    df["type"] = df["type"].astype(str).str.strip().str.lower()
    df["description"] = df["description"].astype(str)
    return df


def load_sample_csv(path: Path | None = None) -> pd.DataFrame:
    """Default demo data when no upload exists."""
    from io import StringIO

    base = Path(__file__).resolve().parent.parent / "data" / "sample_transactions.csv"
    p = path or base
    if not p.is_file():
        # Fallback if CSV was omitted from deploy (should not happen after Docker includes data/).
        _minimal = """date,amount,type,description
2026-03-01,125.50,credit,Card sale
2026-03-01,2100.00,debit,Supplier invoice
2026-03-02,89.00,credit,POS sale
"""
        df = pd.read_csv(StringIO(_minimal))
    else:
        df = pd.read_csv(p)
    out = validate_and_normalize(df)
    out["source"] = "csv"
    global _source_mix
    _source_mix = {"csv": 0, "paytm": 0, "sms": 0, "ocr": 0}
    _source_mix["csv"] = len(out)
    return out


def ingest_upload(file_bytes: bytes) -> tuple[pd.DataFrame, dict]:
    """
    Full ingest: parse, validate, persist session, return summary dict.
    Tries flexible bank/Paytm-style layouts first, then strict date/amount/type/description.
    """
    raw = load_csv_from_upload(file_bytes)
    try:
        candidate = flexible_csv_to_standard(raw)
    except ValueError:
        candidate = raw
        df = validate_and_normalize(candidate)
    else:
        df = validate_and_normalize(candidate)
    df["source"] = "csv"
    reset_source_mix()
    _source_mix["csv"] = len(df)
    set_session_dataframe(df)
    tmp = df.copy()
    tmp["type_normalized"] = tmp["type"].astype(str).str.strip().str.lower()
    tmp = apply_signed_amounts(tmp)
    total_signed = float(tmp["amount_signed"].sum())
    summary = {
        "rows": len(df),
        "total_amount_signed": total_signed,
    }
    return df, summary


def append_parsed_transactions(rows: list[dict], source: str = "sms") -> int:
    """
    Append SMS/OCR rows to the active session ledger (same schema as CSV).
    `source` is one of: sms, ocr
    """
    global _session_df, _source_mix
    if not rows:
        return 0
    extra = pd.DataFrame(rows)
    keep = [c for c in extra.columns if c in REQUIRED_COLUMNS]
    extra = extra[keep]
    extra = validate_and_normalize(extra)
    extra["source"] = source
    _source_mix[source] = _source_mix.get(source, 0) + len(extra)

    if _session_df is None:
        _session_df = extra
    else:
        if "source" not in _session_df.columns:
            _session_df["source"] = "csv"
        _session_df = pd.concat([_session_df, extra], ignore_index=True)
    sync_source_mix_from_df(_session_df)
    return len(extra)


def get_unified_transactions() -> pd.DataFrame | None:
    """Alias for the active session ledger (CSV + Paytm + SMS + OCR)."""
    return get_session_dataframe()


def tag_rows_as_paytm(df: pd.DataFrame) -> pd.DataFrame:
    """Mark rows as sourced from Paytm export / API (in-memory demo)."""
    out = df.copy()
    out["source"] = "paytm"
    return out
