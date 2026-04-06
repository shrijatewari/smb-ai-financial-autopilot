"""End-to-end financial control pipeline for API routes."""

from __future__ import annotations

import numpy as np
import pandas as pd

from services import ingestion_service
from services.classification_service import classify_dataframe
from services.credit_model import default_probability
from services.reconstruction_service import estimate_missing_cash_revenue
from services.simulation_engine import run_simulation
from services.cashflow_engine import compute_ledgers
from services.fraud_detection import analyze as fraud_analyze
from utils.feature_engineering import transaction_volatility_score
from services.decision_engine import build_actions, risk_explanation
from services import rl_engine


def _cash_flow_series(ledger: pd.DataFrame) -> list[dict]:
    """Historical balance points for charting."""
    if ledger.empty or "balance" not in ledger.columns:
        return []
    out: list[dict] = []
    for _, r in ledger.sort_values("date").iterrows():
        dt = r["date"]
        ds = dt.strftime("%Y-%m-%d") if hasattr(dt, "strftime") else str(dt)[:10]
        out.append({"date": ds, "balance": float(r["balance"])})
    return out


def _append_forecast_to_cash_series(historical: list[dict], sim: dict) -> list[dict]:
    """
    Append mean simulated path (one point per horizon day) so `horizon_days` changes the chart.
    Historical segment alone does not depend on forecast horizon.
    """
    paths = sim.get("future_balances") or []
    if not paths:
        return historical
    arr = np.asarray(paths, dtype=float)
    if arr.ndim != 2 or arr.size == 0:
        return historical
    mean_path = np.mean(arr, axis=0)
    out = list(historical)
    for i in range(int(mean_path.shape[0])):
        out.append({"date": f"+{i + 1}d", "balance": float(mean_path[i])})
    return out


def _rolling_revenue_stats(ledger: pd.DataFrame) -> tuple[float, float]:
    if ledger.empty or "amount_signed" not in ledger.columns:
        return 0.0, 0.0
    d = ledger.copy()
    d["day"] = pd.to_datetime(d["date"]).dt.normalize()
    daily = d.loc[d["amount_signed"] > 0].groupby("day")["amount_signed"].sum()
    if len(daily) < 2:
        return float(daily.mean()) if len(daily) else 0.0, 0.0
    return float(daily.mean()), float(daily.var(ddof=1))


def _load_ledger() -> pd.DataFrame | None:
    df = ingestion_service.get_session_dataframe()
    if df is None:
        df = ingestion_service.load_sample_csv()
        ingestion_service.set_session_dataframe(df)
    if "source" not in df.columns:
        df = df.copy()
        df["source"] = "csv"
    ingestion_service.sync_source_mix_from_df(df)
    return df


def run_full_pipeline(
    initial_balance: float = 10_000.0,
    horizon_days: int = 30,
    receivable_lag_days: float | None = None,
    payable_lag_days: float | None = None,
    monte_carlo_paths: int | None = None,
    random_state: int | None = 42,
    gst_payment_amount: float | None = None,
    gst_payment_day: int | None = None,
) -> dict:
    """
    Load session ledger, classify, reconstruct revenue, build cash path, simulate, score credit, fraud.
    """
    df = _load_ledger()
    if df is None or df.empty:
        raise ValueError("No transaction data available")

    classified = classify_dataframe(df)
    ledger, lag_meta = compute_ledgers(
        classified,
        initial_balance=initial_balance,
        receivable_lag_days=receivable_lag_days,
        payable_lag_days=payable_lag_days,
    )

    recon = estimate_missing_cash_revenue(ledger)
    last_bal = float(ledger["balance"].iloc[-1])

    sim = run_simulation(
        ledger,
        last_balance=last_bal,
        horizon_days=horizon_days,
        n_paths=monte_carlo_paths,
        random_state=random_state,
        gst_payment_amount=gst_payment_amount,
        gst_payment_day=gst_payment_day,
    )

    credit = default_probability(ledger)
    vol = transaction_volatility_score(ledger)

    if "business_category" in ledger.columns:
        receivable_exp = float(
            ledger.loc[ledger["business_category"] == "revenue", "amount_signed"].clip(lower=0).sum()
        )
    else:
        receivable_exp = float(ledger.loc[ledger["amount_signed"] > 0, "amount_signed"].sum())

    explanation = risk_explanation(
        sim["probability_of_negative_cash"],
        horizon_days,
        credit["default_probability"],
        vol,
    )

    actions = build_actions(
        probability_of_negative_cash=float(sim["probability_of_negative_cash"]),
        default_probability=float(credit["default_probability"]),
        receivable_exposure=receivable_exp,
        min_cash=float(sim["worst_case_cash"]),
    )
    actions, rl_meta = rl_engine.rank_actions(
        actions,
        current_cash=last_bal,
        risk_prob=float(sim["probability_of_negative_cash"]),
        receivable_exp=receivable_exp,
        default_prob=float(credit["default_probability"]),
        worst_case_cash=float(sim["worst_case_cash"]),
    )

    fraud = fraud_analyze(ledger)
    ledger_out = fraud.get("dataframe", ledger)
    roll_mu, roll_var = _rolling_revenue_stats(ledger_out)
    cash_series = _cash_flow_series(ledger_out)
    cash_series = _append_forecast_to_cash_series(cash_series, sim)
    suspicious = _suspicious_transactions_list(ledger_out)
    spike_alerts = _revenue_spike_alerts(roll_mu, roll_var)

    return {
        "ledger": ledger_out,
        "reconstruction": recon,
        "lag": lag_meta,
        "simulation": sim,
        "receivable_exposure": receivable_exp,
        "credit": credit,
        "volatility_score": vol,
        "risk_explanation": explanation,
        "actions": actions,
        "fraud_flags": fraud.get("flags", []),
        "fraud_summary": fraud.get("fraud_summary", {}),
        "suspicious_transactions": suspicious,
        "revenue_spike_alerts": spike_alerts,
        "source_mix": ingestion_service.get_source_mix(),
        "rolling_revenue_mean": roll_mu,
        "rolling_revenue_variance": roll_var,
        "current_cash": last_bal,
        "cash_flow_series": cash_series,
        "rl": rl_meta,
    }


def _suspicious_transactions_list(ledger_out: pd.DataFrame) -> list[dict]:
    if ledger_out is None or ledger_out.empty or "is_suspicious" not in ledger_out.columns:
        return []
    sub = ledger_out.loc[ledger_out["is_suspicious"]]
    out: list[dict] = []
    for _, r in sub.tail(50).iterrows():
        zs = r.get("z_score")
        out.append(
            {
                "date": str(r.get("date", ""))[:10],
                "amount": float(r.get("amount", 0)),
                "z_score": float(zs) if pd.notna(zs) else None,
                "description": str(r.get("description", ""))[:200],
            }
        )
    return out


def _revenue_spike_alerts(roll_mu: float, roll_var: float) -> list[str]:
    if roll_mu <= 0:
        return []
    cv = (roll_var**0.5) / (roll_mu + 1e-6)
    if cv > 1.2:
        return [
            "Unusual day-to-day revenue variance vs recent mean – possible spike or reporting gap."
        ]
    return []
