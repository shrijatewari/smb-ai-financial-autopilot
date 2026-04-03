"""Fraud and anomaly alerts API."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from services.financial_pipeline import run_full_pipeline

router = APIRouter()


@router.get("/fraud")
def get_fraud_alerts(
    initial_balance: float = Query(10_000.0, ge=0.0),
    horizon_days: int = Query(30, ge=5, le=120),
):
    """Suspicious transactions, model flags, and revenue-spike hints."""
    try:
        out = run_full_pipeline(initial_balance=initial_balance, horizon_days=horizon_days)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return {
        "fraud_flags": out["fraud_flags"],
        "fraud_summary": out["fraud_summary"],
        "suspicious_transactions": out.get("suspicious_transactions", []),
        "revenue_spike_alerts": out.get("revenue_spike_alerts", []),
    }
