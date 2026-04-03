"""Monte Carlo simulation endpoint."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from services.financial_pipeline import run_full_pipeline

router = APIRouter()


@router.get("/run")
def run_simulation_endpoint(
    initial_balance: float = Query(10_000.0, ge=0.0),
    horizon_days: int = Query(30, ge=5, le=120),
    paths: int = Query(1000, ge=500, le=5000),
    receivable_lag_days: float | None = Query(None),
    payable_lag_days: float | None = Query(None),
):
    try:
        out = run_full_pipeline(
            initial_balance=initial_balance,
            horizon_days=horizon_days,
            receivable_lag_days=receivable_lag_days,
            payable_lag_days=payable_lag_days,
            monte_carlo_paths=paths,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    sim = out["simulation"]
    paths = sim.get("future_balances") or []
    terminal = [float(p[-1]) for p in paths if p]
    if len(terminal) > 800:
        import numpy as np

        rng = np.random.default_rng(42)
        ix = rng.choice(len(terminal), 800, replace=False)
        terminal = [terminal[i] for i in ix]

    return {
        "probability_of_negative_cash": sim["probability_of_negative_cash"],
        "worst_case_cash": sim["worst_case_cash"],
        "best_case_cash": sim["best_case_cash"],
        "expected_cash": sim["expected_cash"],
        "horizon_days": sim["horizon_days"],
        "paths_simulated": sim["paths_simulated"],
        "narrative": sim["narrative"],
        "terminal_cash_samples": terminal,
    }
