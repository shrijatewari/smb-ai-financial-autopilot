"""Cash-flow forecast and risk probability."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from services.financial_pipeline import run_full_pipeline

router = APIRouter()


@router.get("/cashflow")
def get_cashflow_forecast(
    initial_balance: float = Query(10_000.0, ge=0.0),
    horizon_days: int = Query(30, ge=5, le=120),
    receivable_lag_days: float | None = Query(None, ge=0.0, le=90.0),
    payable_lag_days: float | None = Query(None, ge=0.0, le=90.0),
):
    """
    Rolling revenue moments + Monte Carlo risk + narrative explanation.
    """
    try:
        out = run_full_pipeline(
            initial_balance=initial_balance,
            horizon_days=horizon_days,
            receivable_lag_days=receivable_lag_days,
            payable_lag_days=payable_lag_days,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    sim = out["simulation"]
    return {
        "current_cash": out["current_cash"],
        "horizon_days": horizon_days,
        "expected_cash_end": sim["expected_cash"],
        "rolling_revenue_mean": out["rolling_revenue_mean"],
        "rolling_revenue_variance": out["rolling_revenue_variance"],
        "probability_of_negative_cash": sim["probability_of_negative_cash"],
        "worst_case_cash": sim["worst_case_cash"],
        "best_case_cash": sim["best_case_cash"],
        "risk_explanation": out["risk_explanation"],
        "reconstruction": out["reconstruction"],
        "lag_assumptions": out["lag"],
        "cash_flow_series": out.get("cash_flow_series") or [],
    }
