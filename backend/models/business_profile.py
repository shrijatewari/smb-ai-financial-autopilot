"""Aggregate business metrics, formality, and trust signals."""

from __future__ import annotations

import pandas as pd


def compute_business_profile(
    df: pd.DataFrame,
    meta: dict | None = None,
    fraud_summary: dict | None = None,
) -> dict:
    """
    Summary stats plus:
    - formality_score: structured / descriptive richness of ledger (0–1)
    - trust_score: confidence from data-source mix + consistency (0–1)

    `meta` may include: source_mix {csv, sms, ocr counts}, onboarding {has_gst, doc_count}
    """
    meta = meta or {}
    fraud_summary = fraud_summary or {}
    n = len(df)
    if n == 0:
        return {
            "average_transaction_size": 0.0,
            "number_of_transactions": 0,
            "credit_debit_ratio": 0.0,
            "formality_score": 0.0,
            "trust_score": 0.0,
        }

    avg_size = float(df["amount"].abs().mean())
    credits = df["type_normalized"].isin(("credit", "cr", "c"))
    debits = df["type_normalized"].isin(("debit", "dr", "d"))
    n_cr = int(credits.sum())
    n_dr = int(debits.sum())
    ratio = float(n_cr / n_dr) if n_dr > 0 else float(n_cr)

    # Formality: longer descriptions + category spread imply more "documented" ops
    desc = df["description"].astype(str)
    avg_len = float(desc.str.len().mean()) or 0.0
    len_component = min(1.0, avg_len / 72.0)
    if "category" in df.columns:
        n_cat = df["category"].nunique()
        cat_component = min(1.0, n_cat / 4.0)
    else:
        cat_component = 0.5
    susp_ratio = 0.0
    if fraud_summary.get("flagged_count", 0) and n > 0:
        susp_ratio = min(1.0, fraud_summary["flagged_count"] / n)
    formality_score = round(
        0.45 * len_component + 0.35 * cat_component + 0.20 * (1.0 - susp_ratio),
        3,
    )

    # Trust: weighted presence of CSV (bank file), Paytm, SMS, OCR
    mix = meta.get("source_mix") or {}
    csv_n = float(mix.get("csv", 0))
    paytm_n = float(mix.get("paytm", 0))
    sms_n = float(mix.get("sms", 0))
    ocr_n = float(mix.get("ocr", 0))
    total_src = csv_n + paytm_n + sms_n + ocr_n + 1e-6
    mix_balance = (
        0.38 * (csv_n / total_src)
        + 0.18 * (paytm_n / total_src)
        + 0.24 * (sms_n / total_src)
        + 0.20 * (ocr_n / total_src)
    )
    onboard = meta.get("onboarding") or {}
    doc_boost = min(0.15, 0.03 * float(onboard.get("doc_count", 0)))
    gst_boost = 0.1 if onboard.get("has_gst") else 0.0
    trust_score = round(min(1.0, 0.55 + 0.35 * mix_balance + doc_boost + gst_boost - 0.1 * susp_ratio), 3)

    out = {
        "average_transaction_size": round(avg_size, 2),
        "number_of_transactions": n,
        "credit_debit_ratio": round(ratio, 3),
        "credit_count": n_cr,
        "debit_count": n_dr,
        "formality_score": formality_score,
        "trust_score": trust_score,
    }
    return out
