"""Transaction classification: revenue, expense, loan, supplier, unknown."""

from __future__ import annotations

import re

import numpy as np
import pandas as pd

from models.transaction_classifier import classify_transaction
from utils.constants import CLASS_EXPENSE, CLASS_LOAN, CLASS_REVENUE, CLASS_SUPPLIER, CLASS_UNKNOWN
from utils.helpers import apply_signed_amounts, parse_dates


_LOAN_PAT = re.compile(r"\b(loan|emi|nach|nach mandate|credit.?facility|term loan)\b", re.I)


def _map_legacy_category(cat: str, description: str) -> tuple[str, float]:
    """Map internal classifier labels to fintech taxonomy."""
    desc = str(description or "")
    if _LOAN_PAT.search(desc):
        return CLASS_LOAN, 0.88

    c = (cat or "").lower().strip()
    if c == "sale":
        return CLASS_REVENUE, 0.82
    if c == "supplier":
        return CLASS_SUPPLIER, 0.8
    if c == "personal":
        return CLASS_EXPENSE, 0.72
    return CLASS_UNKNOWN, 0.45


def classify_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Add columns: `business_category`, `classification_confidence`.
    """
    if df.empty:
        out = df.copy()
        out["business_category"] = []
        out["classification_confidence"] = []
        return out

    d = parse_dates(df.copy())
    if "type_normalized" not in d.columns:
        d["type_normalized"] = d["type"].astype(str).str.strip().str.lower()
    d = apply_signed_amounts(d)
    d = classify_transaction(d)
    cats: list[str] = []
    confs: list[float] = []
    for _, row in d.iterrows():
        cat, cf = _map_legacy_category(str(row.get("category", "")), str(row.get("description", "")))
        cats.append(cat)
        confs.append(cf)
    d["business_category"] = cats
    d["classification_confidence"] = np.asarray(confs, dtype=float)
    return d
