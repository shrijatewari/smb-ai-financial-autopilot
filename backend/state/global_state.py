"""
Thread-safe snapshot of the live financial control plane (fed by system_engine).
"""

from __future__ import annotations

import copy
import threading
import time
from datetime import datetime, timezone
from typing import Any

_lock = threading.RLock()

# Unified shape for GET /system/state and the dashboard
_state: dict[str, Any] = {
    "cash": None,
    "risk": None,
    "confidence": None,
    "forecast": [],
    "simulation": [],
    "daily_control": None,
    "action": None,
    "alerts": [],
    "reconstruction": None,
    "credit": None,
    "risk_explanation": None,
    "modules": [],
    "profile_type": "",
    "document_profile": None,
    "meta": {
        "tick": 0,
        "updated_at": None,
        "horizon_days": 30,
        "paths_simulated": 0,
        "status": "idle",
        "error": None,
    },
}


def get_snapshot() -> dict[str, Any]:
    try:
        from services.redis_snapshot import fetch_snapshot, snapshot_enabled

        if snapshot_enabled():
            remote = fetch_snapshot()
            if isinstance(remote, dict) and remote.get("meta") is not None:
                return copy.deepcopy(remote)
    except Exception:
        pass
    with _lock:
        return copy.deepcopy(_state)


def reset() -> None:
    with _lock:
        _state["cash"] = None
        _state["risk"] = None
        _state["confidence"] = None
        _state["forecast"] = []
        _state["simulation"] = []
        _state["daily_control"] = None
        _state["action"] = None
        _state["alerts"] = []
        _state["reconstruction"] = None
        _state["credit"] = None
        _state["risk_explanation"] = None
        _state["modules"] = []
        _state["profile_type"] = ""
        _state["document_profile"] = None
        _state["meta"] = {
            "tick": 0,
            "updated_at": None,
            "horizon_days": 30,
            "paths_simulated": 0,
            "status": "idle",
            "error": None,
        }


def update_from_error(message: str, tick: int) -> None:
    with _lock:
        _state["meta"]["status"] = "error"
        _state["meta"]["error"] = message
        _state["meta"]["tick"] = tick
        _state["meta"]["updated_at"] = datetime.now(timezone.utc).isoformat()
    _publish_snapshot_wire()


def _publish_snapshot_wire() -> None:
    try:
        from services.redis_snapshot import publish_snapshot

        with _lock:
            snap = _json_safe(copy.deepcopy(_state))
        publish_snapshot(snap)
    except Exception:
        pass


def _terminal_samples(sim: dict, max_points: int = 500) -> list[float]:
    paths = sim.get("future_balances") or []
    terminal = [float(p[-1]) for p in paths if p]
    if len(terminal) > max_points:
        import numpy as np

        rng = np.random.default_rng(42)
        ix = rng.choice(len(terminal), max_points, replace=False)
        terminal = [terminal[i] for i in ix]
    return terminal


def _json_safe(x: Any) -> Any:
    if hasattr(x, "item"):
        try:
            return float(x.item())
        except Exception:
            pass
    if isinstance(x, dict):
        return {k: _json_safe(v) for k, v in x.items()}
    if isinstance(x, list):
        return [_json_safe(v) for v in x]
    return x


def update_from_pipeline(out: dict, tick: int) -> None:
    """Map run_full_pipeline() output into global snapshot."""
    from services import state_store
    from services.daily_control import (
        build_collection_queue,
        days_until_negative_cash,
        estimate_action_outcomes,
    )

    sim = out.get("simulation") or {}
    recon = out.get("reconstruction") or {}
    actions = out.get("actions") or []

    primary = actions[0] if actions else None
    if primary:
        primary = _json_safe(primary)

    paths_sim = sim.get("future_balances") or []
    days_neg = days_until_negative_cash(paths_sim)
    rec_exp = float(out.get("receivable_exposure") or 0.0)
    risk_p = float(sim.get("probability_of_negative_cash") or 0.0)
    sug_amt = 0.0
    if isinstance(primary, dict) and primary.get("metadata"):
        sug_amt = float(primary["metadata"].get("suggested_amount") or 0.0)
    if sug_amt <= 0:
        sug_amt = max(2400.0, rec_exp * 0.12)
    outcomes = estimate_action_outcomes(risk_p, sug_amt, rec_exp)
    collection_q = build_collection_queue(rec_exp, tick)
    # Align primary "collect_payment" with top of queue (decision_engine used a hardcoded name)
    if primary and isinstance(primary, dict) and primary.get("action") == "collect_payment" and collection_q:
        top = collection_q[0]
        meta = dict(primary.get("metadata") or {})
        meta["customer"] = str(top.get("name") or meta.get("customer") or "Customer")
        try:
            meta["suggested_amount"] = float(top.get("amount", meta.get("suggested_amount", 0)))
        except (TypeError, ValueError):
            pass
        primary = {**primary, "metadata": meta}
    if days_neg is None:
        runway_line = "Majority of simulated paths stay above zero in the horizon – still chase dues to improve buffer."
    else:
        runway_line = (
            f"You may run out of cash in about {days_neg} day{'s' if days_neg != 1 else ''} "
            "if collections and inflows do not improve."
        )
    daily_control = {
        "days_to_negative": days_neg,
        "runway_summary": runway_line,
        "collection_queue": collection_q,
        "action_outcomes": outcomes,
    }

    flags = list(out.get("fraud_flags") or [])
    spike = list(out.get("revenue_spike_alerts") or [])
    suspicious = out.get("suspicious_transactions") or []
    alerts: list[str | dict] = [*flags, *spike]
    for row in suspicious[:8]:
        if isinstance(row, dict):
            alerts.append(
                {
                    "type": "suspicious_txn",
                    "date": row.get("date"),
                    "amount": row.get("amount"),
                    "z_score": row.get("z_score"),
                }
            )

    forecast = out.get("cash_flow_series") or []
    terminal = _terminal_samples(sim, max_points=500)

    prof = state_store.get_business_profile_snapshot(None)
    modules: list = []
    profile_type = ""
    if prof:
        modules = list(prof.get("active_modules") or [])
        profile_type = str(prof.get("profile_type") or "")

    doc_prof = state_store.get_document_profile(None)

    with _lock:
        _state["cash"] = float(out.get("current_cash") or 0.0)
        _state["risk"] = float(sim.get("probability_of_negative_cash") or 0.0)
        _state["confidence"] = float(recon.get("confidence") or 0.0) if isinstance(recon, dict) else 0.0
        _state["forecast"] = forecast
        _state["simulation"] = terminal
        _state["daily_control"] = _json_safe(daily_control)
        _state["action"] = primary
        _state["alerts"] = alerts
        _state["reconstruction"] = _json_safe(recon) if isinstance(recon, dict) else recon
        _state["credit"] = _json_safe(out.get("credit") or {})
        _state["risk_explanation"] = str(out.get("risk_explanation") or "")
        _state["modules"] = modules
        _state["profile_type"] = profile_type
        _state["document_profile"] = _json_safe(doc_prof) if doc_prof else None
        rl_out = out.get("rl") or {}
        _state["meta"] = {
            "tick": tick,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "horizon_days": int(sim.get("horizon_days") or 30),
            "paths_simulated": int(sim.get("paths_simulated") or 0),
            "expected_cash": float(sim.get("expected_cash") or 0.0),
            "worst_case_cash": float(sim.get("worst_case_cash") or 0.0),
            "best_case_cash": float(sim.get("best_case_cash") or 0.0),
            "status": "ok",
            "error": None,
            "rl": _json_safe(rl_out) if isinstance(rl_out, dict) else {},
        }
    _publish_snapshot_wire()
