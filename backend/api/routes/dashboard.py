"""Aggregated control-plane snapshot + business modules."""

from __future__ import annotations

import numpy as np
from fastapi import APIRouter, Depends, HTTPException, Query

from auth.deps import get_current_user_optional
from prisma.models import User
from models.business_profile_engine import compute_business_vector, compute_formality_score
from services import state_store
from integrations.gst import resolve_gst_monte_carlo_params
from services.financial_pipeline import run_full_pipeline
from services.module_selector import infer_profile_type_label, select_modules
from services.onboarding_persistence import ensure_user_business_context_loaded

router = APIRouter()


@router.get("")
async def get_dashboard(
    user: User | None = Depends(get_current_user_optional),
    initial_balance: float = Query(10_000.0, ge=0.0),
    horizon_days: int = Query(30, ge=5, le=120),
):
    """Current cash, risk, reconstruction, fraud, modules from business profile, and recommended actions."""
    gst_amt, gst_day = None, None
    if user is not None:
        await ensure_user_business_context_loaded(user.id)
        gst_amt, gst_day = await resolve_gst_monte_carlo_params(user.id, horizon_days)
    try:
        out = run_full_pipeline(
            initial_balance=initial_balance,
            horizon_days=horizon_days,
            gst_payment_amount=gst_amt,
            gst_payment_day=gst_day,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    sim = out["simulation"]
    uid = user.id if user else None
    snap = state_store.get_business_profile_snapshot(uid)
    ob = state_store.get_onboarding(uid)

    modules: list[dict]
    profile_type = ""
    if snap and snap.get("active_modules"):
        modules = snap["active_modules"]
        profile_type = str(snap.get("profile_type") or "")
    elif ob:
        f = compute_formality_score(ob)
        vec = compute_business_vector(ob, None, f)
        modules = select_modules(vec, ob)
        profile_type = infer_profile_type_label(ob, vec)
    else:
        modules = [
            {"name": "cash", "priority": 0.95},
            {"name": "inventory", "priority": 0.55},
            {"name": "credit", "priority": 0.45},
            {"name": "payables", "priority": 0.5},
            {"name": "compliance", "priority": 0.4},
        ]
        profile_type = "default_unconfigured"

    paytm_connected = bool(uid is not None and state_store.get_paytm_state(uid))

    paths = sim.get("future_balances") or []
    terminal = [float(p[-1]) for p in paths if p]
    if len(terminal) > 800:
        rng = np.random.default_rng(42)
        ix = rng.choice(len(terminal), 800, replace=False)
        terminal = [terminal[i] for i in ix]

    return {
        "modules": modules,
        "profile_type": profile_type,
        "paytm_connected": paytm_connected,
        "cash_flow_series": out.get("cash_flow_series") or [],
        "terminal_cash_samples": terminal,
        "current_cash": out["current_cash"],
        "risk_probability": sim["probability_of_negative_cash"],
        "worst_case_cash": sim["worst_case_cash"],
        "best_case_cash": sim["best_case_cash"],
        "expected_cash": sim["expected_cash"],
        "risk_explanation": out["risk_explanation"],
        "reconstruction": out["reconstruction"],
        "credit": out["credit"],
        "alerts": out["fraud_flags"],
        "fraud_summary": out["fraud_summary"],
        "suspicious_transactions": out.get("suspicious_transactions", []),
        "revenue_spike_alerts": out.get("revenue_spike_alerts", []),
        "recommended_actions": out["actions"],
        "source_mix": out["source_mix"],
        "rolling_revenue_mean": out["rolling_revenue_mean"],
        "rolling_revenue_variance": out["rolling_revenue_variance"],
    }
