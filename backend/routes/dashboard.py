"""Dashboard aggregate endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Query

from schemas.dashboard_schema import DashboardResponse
from services import decision_service, ingestion_service, state_store
from services.inference_service import run_inference

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard", response_model=DashboardResponse)
def get_dashboard(
    initial_balance: float = Query(10_000.0, ge=0, description="Starting cash before first transaction"),
    horizon_days: int = Query(30, ge=5, le=90, description="Monte Carlo horizon in days"),
    user_id: str = Query("demo_user", description="User id for simulated Paytm ledger context"),
):
    """
    Returns classified transactions, cash-flow series, Monte Carlo risk (with min/max cash),
    business profile, alerts, and recommended actions (including simulated Paytm links when risk is high).

    Uses the last uploaded CSV if present; otherwise loads bundled sample data.
    """
    df = ingestion_service.get_session_dataframe()
    if df is None:
        df = ingestion_service.load_sample_csv()
    if "source" not in df.columns:
        df = df.copy()
        df["source"] = "csv"
    # Persist ledger so SMS/OCR merges survive across requests and match trust_score.
    ingestion_service.set_session_dataframe(df)
    ingestion_service.sync_source_mix_from_df(df)

    out = run_inference(df, initial_balance=initial_balance, horizon_days=horizon_days)
    onboarding = state_store.get_onboarding()
    return decision_service.build_dashboard_response(
        out["dataframe"],
        out["risk_probability"],
        out["min_cash"],
        out["max_cash"],
        out["profile"],
        out["future_balances"],
        out["fraud_summary"],
        user_id=user_id,
        source_mix=ingestion_service.get_source_mix(),
        enriched_profile=out.get("enriched_profile") or {},
        active_modules=out.get("active_modules") or [],
        inventory_metrics=out.get("inventory_metrics") or {},
        system_state=out.get("system_state") or {},
        onboarding=onboarding,
    )
