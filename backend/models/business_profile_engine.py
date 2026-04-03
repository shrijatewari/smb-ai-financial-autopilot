"""
Business profile engine: formality, trust, business vector, and enriched profile.

Combines onboarding signals with ledger statistics for downstream inference and UI.
"""

from __future__ import annotations

import math
from typing import Any

import pandas as pd

from services import state_store


def _norm_revenue_model(s: str) -> float:
    m = (s or "").lower().strip()
    if m == "product":
        return 0.0
    if m == "service":
        return 0.33
    if m == "hybrid":
        return 0.66
    return 0.5


def _norm_inventory(inv: str) -> float:
    m = (inv or "").lower().strip()
    return {"none": 0.0, "low": 0.33, "high": 0.66, "high_value": 1.0}.get(m, 0.33)


def _norm_credit(c: str) -> float:
    m = (c or "").lower().strip()
    return {"none": 0.0, "informal": 0.5, "formal": 1.0}.get(m, 0.33)


def _scale_score(num_employees: int, turnover_hint: str) -> float:
    """Rough 0–1 scale from headcount and turnover bucket."""
    t = (turnover_hint or "").lower().strip()
    te = 0.35
    # Explicit onboarding buckets (INR / month)
    if t in ("under_50k", "under-50k", "<50k"):
        te = 0.1
    elif t in ("50k_to_5l", "50k-5l"):
        te = 0.22
    elif t in ("5l_to_50l", "5l-50l"):
        te = 0.55
    elif t in ("50l_plus", "50l+"):
        te = 0.85
    # Legacy string ranges (older UI)
    elif "0" in t and "5l" in t and "25" not in t:
        te = 0.2
    elif "5-25" in t or ("25l" in t and "1cr" not in t and "50l" not in t):
        te = 0.45
    elif "1cr" in t or "cr+" in t or ("50l" in t and "plus" in t):
        te = 0.75
    elif "under" in t:
        te = 0.2
    he = min(1.0, math.log1p(max(0, num_employees)) / math.log1p(500))
    return float(min(1.0, 0.55 * te + 0.45 * he))


def compute_formality_score(onboarding: dict[str, Any]) -> float:
    """
    F = weighted sum of structured signals:
    PAN (assumed if GST registered), GST, invoices, bank data.
    Weights sum to 1.0; each component is 0 or 1 (or partial for GST/PAN joint).
    """
    gst = bool(onboarding.get("gst_registered"))
    pan = gst  # assume PAN present when GST registered
    inv = bool(onboarding.get("has_invoices"))
    bank = bool(onboarding.get("has_bank_data"))

    # Weights: PAN 0.2, GST 0.25, invoices 0.25, bank 0.3
    f = 0.0
    f += 0.20 * (1.0 if pan else 0.0)
    f += 0.25 * (1.0 if gst else 0.0)
    f += 0.25 * (1.0 if inv else 0.0)
    f += 0.30 * (1.0 if bank else 0.0)
    return float(round(min(1.0, f), 4))


def compute_trust_score(
    onboarding: dict[str, Any],
    source_mix: dict[str, int],
) -> float:
    """
    T from availability of: bank file (csv), Paytm, SMS, OCR, plus onboarding docs.
    """
    mix = source_mix or {}
    csv_n = float(mix.get("csv", 0))
    paytm_n = float(mix.get("paytm", 0))
    sms_n = float(mix.get("sms", 0))
    ocr_n = float(mix.get("ocr", 0))
    total = csv_n + paytm_n + sms_n + ocr_n + 1e-6

    # Channel quality weights
    mix_score = (
        0.28 * (csv_n / total)
        + 0.22 * (paytm_n / total)
        + 0.22 * (sms_n / total)
        + 0.18 * (ocr_n / total)
    )

    doc_boost = 0.06 if onboarding.get("has_invoices") else 0.0
    gst_boost = 0.08 if onboarding.get("gst_registered") else 0.0
    bank_flag = 0.07 if onboarding.get("has_bank_data") else 0.0

    ds = onboarding.get("data_sources") or []
    intent_boost = 0.0
    if isinstance(ds, (list, tuple)):
        active = [str(x).lower() for x in ds if x and str(x).lower() != "none"]
        if active:
            intent_boost = 0.012 * min(len(active), 4)

    t = 0.42 + 0.45 * mix_score + doc_boost + gst_boost + bank_flag + intent_boost
    return float(round(min(1.0, t), 4))


def _transaction_pattern_score(df: pd.DataFrame) -> float:
    if df is None or df.empty or "amount_signed" not in df.columns:
        return 0.5
    s = df["amount_signed"].astype(float)
    cv = float(s.std(ddof=1) / (abs(s.mean()) + 1e-6)) if len(s) > 1 else 0.0
    return float(min(1.0, 0.35 + 0.65 * min(1.0, cv / 3.0)))


def compute_business_vector(
    onboarding: dict[str, Any],
    df: pd.DataFrame | None,
    formality_score: float,
) -> list[float]:
    """
    Business vector (numeric features, 0–1 scale where applicable):
    [revenue_model, transaction_pattern, payment_mix_digital, inventory_complexity,
     credit_behavior, formality_score, scale]
    """
    pm = onboarding.get("payment_mix") or {}
    digital = float(pm.get("digital", 0.5))
    cash = float(pm.get("cash", 1.0 - digital))
    s = cash + digital
    if s > 0:
        digital_norm = digital / s
    else:
        digital_norm = 0.5

    tp = _transaction_pattern_score(df) if df is not None else 0.5

    vec = [
        _norm_revenue_model(str(onboarding.get("revenue_model", ""))),
        tp,
        digital_norm,
        _norm_inventory(str(onboarding.get("inventory_type", "low"))),
        _norm_credit(str(onboarding.get("credit_usage", "none"))),
        float(formality_score),
        _scale_score(int(onboarding.get("num_employees", 0)), str(onboarding.get("monthly_turnover_range", ""))),
    ]
    return [float(round(x, 4)) for x in vec]


def build_enriched_profile(
    df: pd.DataFrame | None,
    source_mix: dict[str, int],
    ledger_profile: dict[str, Any],
    fraud_summary: dict[str, Any] | None = None,
    onboarding_override: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Merge onboarding-driven engine scores with ledger-based `compute_business_profile` stats.

    `ledger_profile` is the output of models.business_profile.compute_business_profile.
    """
    raw_onb = onboarding_override if onboarding_override is not None else state_store.get_onboarding()
    ob = raw_onb or {}
    has_onboarding = raw_onb is not None
    fraud_summary = fraud_summary or {}

    f_onb = compute_formality_score(ob) if has_onboarding else 0.0
    t_mix = compute_trust_score(ob, source_mix)

    f_led = float(ledger_profile.get("formality_score", 0.0))
    formality_blended = float(round(0.55 * f_onb + 0.45 * f_led, 4)) if has_onboarding else f_led

    t_led = float(ledger_profile.get("trust_score", 0.0))
    trust_blended = float(round(0.50 * t_mix + 0.50 * t_led, 4))

    vector = compute_business_vector(ob, df, formality_blended)

    return {
        "business_type": ob.get("business_type", ""),
        "revenue_model": ob.get("revenue_model", ""),
        "inventory_type": ob.get("inventory_type", ""),
        "credit_usage": ob.get("credit_usage", ""),
        "monthly_turnover_range": ob.get("monthly_turnover_range", ""),
        "num_employees": int(ob.get("num_employees", 0)),
        "gst_registered": bool(ob.get("gst_registered", False)),
        "has_bank_data": bool(ob.get("has_bank_data", False)),
        "has_invoices": bool(ob.get("has_invoices", False)),
        "payment_mix": ob.get("payment_mix", {}),
        "formality_score": formality_blended,
        "formality_onboarding": f_onb,
        "formality_ledger": f_led,
        "trust_score": trust_blended,
        "trust_channels": t_mix,
        "business_vector": vector,
        "business_vector_labels": [
            "revenue_model",
            "transaction_pattern",
            "payment_mix_digital",
            "inventory_complexity",
            "credit_behavior",
            "formality_score",
            "scale",
        ],
        "average_transaction_size": ledger_profile.get("average_transaction_size", 0.0),
        "number_of_transactions": ledger_profile.get("number_of_transactions", 0),
        "credit_debit_ratio": ledger_profile.get("credit_debit_ratio", 0.0),
        "credit_count": ledger_profile.get("credit_count", 0),
        "debit_count": ledger_profile.get("debit_count", 0),
        "fraud_flagged": int(fraud_summary.get("flagged_count", 0)),
    }


def infer_inventory_metrics(df: pd.DataFrame, onboarding: dict[str, Any] | None) -> dict[str, Any]:
    """Heuristic inventory pressure from supplier debits vs sales credits + onboarding inventory type."""
    ob = onboarding or {}
    inv_type = str(ob.get("inventory_type", "low")).lower()
    if df is None or df.empty or "category" not in df.columns:
        return {
            "inventory_type": inv_type,
            "inventory_pressure": _norm_inventory(inv_type),
            "supplier_debit_share": 0.0,
        }

    d = df.copy()
    supplier_spend = float(d.loc[d["category"] == "supplier", "amount_signed"].clip(upper=0).abs().sum())
    sale_in = float(d.loc[d["category"] == "sale", "amount_signed"].clip(lower=0).sum())
    denom = sale_in + abs(d["amount_signed"].sum()) * 0.25 + 1e-6
    share = min(1.0, supplier_spend / denom)
    pressure = float(min(1.0, 0.55 * _norm_inventory(inv_type) + 0.45 * share))
    return {
        "inventory_type": inv_type,
        "inventory_pressure": round(pressure, 4),
        "supplier_debit_share": round(float(share), 4),
    }


def estimate_system_state(
    prepared: pd.DataFrame,
    inventory_metrics: dict[str, Any],
    mc_result: dict[str, Any],
    onboarding: dict[str, Any] | None,
) -> dict[str, Any]:
    """High-level state after simulation + inventory signals."""
    ob = onboarding or {}
    last_bal = float(prepared["balance"].iloc[-1]) if len(prepared) else 0.0
    min_c = float(mc_result.get("min_cash", 0.0))
    risk_p = float(mc_result.get("risk_probability", 0.0))

    if risk_p > 0.25 or min_c < 0:
        liq = "stressed"
    elif risk_p > 0.1:
        liq = "cautious"
    else:
        liq = "stable"

    return {
        "liquidity_state": liq,
        "last_balance": round(last_bal, 2),
        "risk_probability": risk_p,
        "min_cash_stress": min_c,
        "inventory_pressure": inventory_metrics.get("inventory_pressure", 0.0),
        "revenue_model": str(ob.get("revenue_model", "")),
    }
