"""Advanced inference: classify → cash → inventory → state → simulation → risk → fraud signals."""

from __future__ import annotations

import pandas as pd

from models.business_profile import compute_business_profile
from models.business_profile_engine import (
    build_enriched_profile,
    estimate_system_state,
    infer_inventory_metrics,
)
from models.cashflow_model import compute_running_balance
from models.simulation import run_monte_carlo
from models.transaction_classifier import classify_transaction
from services import ingestion_service, state_store
from services.fraud_service import annotate_transactions, fraud_summary
from services.module_selector import select_modules
from utils.helpers import apply_signed_amounts, parse_dates


def build_pipeline_dataframe(df: pd.DataFrame, initial_balance: float = 10_000.0) -> pd.DataFrame:
    """Parse → signed amounts → classify → fraud annotations → running cash balance."""
    d = parse_dates(df.copy())
    d["type_normalized"] = d["type"].astype(str).str.strip().str.lower()
    d = apply_signed_amounts(d)
    d = classify_transaction(d)
    d = annotate_transactions(d)
    d = compute_running_balance(d, initial_balance=initial_balance)
    return d


def run_inference(
    df: pd.DataFrame,
    initial_balance: float = 10_000.0,
    horizon_days: int = 30,
    intelligence_meta: dict | None = None,
):
    """
    Pipeline:
      1. classify + fraud + cash (running balance)
      2. inventory inference (heuristic)
      3. Monte Carlo simulation + risk metrics
      4. system state estimate
      5. business profile (ledger) + profile engine merge
      6. module selection
    """
    intelligence_meta = intelligence_meta or {}
    onboarding = state_store.get_onboarding() or {}
    meta_onb = {
        "source_mix": ingestion_service.get_source_mix(),
        "onboarding": {
            "has_gst": bool(onboarding.get("gst_registered")),
            "doc_count": 1 if onboarding.get("has_invoices") else 0,
            "has_bank": bool(onboarding.get("has_bank_data")),
        },
    }
    meta_onb["onboarding"].update(intelligence_meta.get("onboarding", {}))

    prepared = build_pipeline_dataframe(df, initial_balance=initial_balance)
    last_balance = float(prepared["balance"].iloc[-1]) if len(prepared) else 0.0

    inventory_metrics = infer_inventory_metrics(prepared, onboarding)

    mc = run_monte_carlo(
        prepared,
        last_balance=last_balance,
        horizon_days=horizon_days,
        n_scenarios=1000,
    )

    system_state = estimate_system_state(prepared, inventory_metrics, mc, onboarding)

    fsum = fraud_summary(prepared)
    ledger_profile = compute_business_profile(prepared, meta=meta_onb, fraud_summary=fsum)

    enriched = build_enriched_profile(
        prepared,
        ingestion_service.get_source_mix(),
        ledger_profile,
        fraud_summary=fsum,
    )

    vector = enriched.get("business_vector") or []
    active_modules = select_modules(vector, onboarding)

    return {
        "dataframe": prepared,
        "risk_probability": mc["risk_probability"],
        "min_cash": mc["min_cash"],
        "max_cash": mc["max_cash"],
        "future_balances": mc["future_balances"],
        "profile": ledger_profile,
        "enriched_profile": enriched,
        "fraud_summary": fsum,
        "inventory_metrics": inventory_metrics,
        "system_state": system_state,
        "active_modules": active_modules,
        "pipeline_meta": {
            "steps": [
                "classify_transactions",
                "infer_cash_balance",
                "infer_inventory",
                "monte_carlo_simulation",
                "estimate_system_state",
                "fraud_signals",
            ],
        },
    }
