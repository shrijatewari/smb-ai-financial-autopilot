"""Assembles API responses from inference outputs and risk-aware recommendations."""

from __future__ import annotations

import pandas as pd

from schemas.dashboard_schema import (
    ActiveModule,
    BusinessProfile,
    CashFlowPoint,
    DashboardResponse,
    RecommendedAction,
)
from schemas.transaction_schema import TransactionRow
from services import paytm_service

RISK_ALERT_THRESHOLD = 0.3


def _df_to_transactions(df: pd.DataFrame) -> list[TransactionRow]:
    rows = []
    for _, r in df.iterrows():
        z = float(r["z_score"]) if "z_score" in df.columns and pd.notna(r.get("z_score")) else None
        susp = bool(r["is_suspicious"]) if "is_suspicious" in df.columns else None
        src = str(r["source"]) if "source" in df.columns and pd.notna(r.get("source")) else None
        rows.append(
            TransactionRow(
                date=r["date"].strftime("%Y-%m-%d") if hasattr(r["date"], "strftime") else str(r["date"]),
                amount=float(abs(r["amount"])),
                type=str(r["type"]),
                description=str(r.get("description", "")),
                category=str(r["category"]),
                balance=float(r["balance"]),
                z_score=z,
                is_suspicious=susp,
                source=src,
            )
        )
    return rows


def _df_to_cash_flow(df: pd.DataFrame) -> list[CashFlowPoint]:
    out = []
    for _, r in df.iterrows():
        out.append(
            CashFlowPoint(
                date=r["date"].strftime("%Y-%m-%d") if hasattr(r["date"], "strftime") else str(r["date"]),
                balance=float(r["balance"]),
                amount_signed=float(r["amount_signed"]),
            )
        )
    return out


def _customer_label(description: str, fallback: str) -> str:
    if description and str(description).strip():
        return str(description).split("–")[0].split("|")[0].strip()[:60]
    return fallback


def _estimate_receivables(df: pd.DataFrame) -> float:
    if df.empty or "category" not in df.columns:
        return 0.0
    mask = (df["category"] == "sale") & (df["amount_signed"] > 0)
    return float(df.loc[mask, "amount_signed"].sum())


def _compute_action_score(
    risk_probability: float,
    receivables: float,
    min_cash: float,
    last_balance: float,
    onboarding: dict | None = None,
) -> float:
    """Higher = more urgency for treasury actions; modulated by business context."""
    cash_gap = max(0.0, -float(min_cash))
    base = max(abs(last_balance), 5000.0)
    rec_norm = min(1.0, receivables / base)
    gap_norm = min(1.0, cash_gap / 25000.0)
    score = 0.36 * risk_probability + 0.32 * rec_norm + 0.28 * gap_norm
    ob = onboarding or {}
    if str(ob.get("revenue_model", "")).lower() == "service":
        score *= 0.92
    cu = str(ob.get("credit_usage", "")).lower()
    if cu == "formal":
        score *= 1.05
    elif cu == "informal":
        score *= 1.02
    inv = str(ob.get("inventory_type", "")).lower()
    if inv in ("high", "high_value"):
        score *= 1.04
    return float(min(1.0, max(0.0, score)))


def _pending_sale_collection_targets(df: pd.DataFrame, max_n: int = 3) -> list[dict]:
    if df.empty or "category" not in df.columns:
        return []
    sales = df[df["category"] == "sale"].copy()
    if sales.empty:
        return []
    sales = sales.sort_values("amount", ascending=False).head(max_n)
    targets = []
    for i, (_, r) in enumerate(sales.iterrows()):
        targets.append(
            {
                "customer": _customer_label(str(r.get("description", "")), f"Customer-{i + 1}"),
                "amount": float(abs(r["amount"])),
            }
        )
    return targets


def build_alerts_and_actions(
    risk_probability: float,
    min_cash: float,
    df: pd.DataFrame,
    fraud_summary: dict,
    action_score: float,
    receivables: float,
    cash_gap: float,
    user_id: str = "demo_user",
    onboarding: dict | None = None,
) -> tuple[list[str], list[RecommendedAction]]:
    alerts: list[str] = []
    actions: list[RecommendedAction] = []
    ob = onboarding or {}

    if fraud_summary.get("flagged_count", 0) > 0:
        alerts.append(
            f"Fraud monitor: {fraud_summary['flagged_count']} transaction(s) exceed z-score threshold "
            f"(max |z| ≈ {fraud_summary.get('max_abs_z', 0):.2f})."
        )

    if risk_probability > RISK_ALERT_THRESHOLD:
        seg = str(ob.get("business_type", "")).strip()
        prefix = f"[{seg}] " if seg else ""
        alerts.append(
            f"{prefix}Liquidity risk: probability of negative cash is {risk_probability:.0%} "
            f"(threshold {RISK_ALERT_THRESHOLD:.0%})."
        )
        alerts.append("Prioritize collections and reduce near-term discretionary spend.")

    if cash_gap > 0 and risk_probability > 0.15:
        alerts.append(
            f"Cash gap: worst-case simulation dips to ₹{min_cash:,.0f}; consider deferring payables."
        )

    # Smart actions (ordered by priority)
    if action_score > 0.45:
        actions.append(
            RecommendedAction(
                type="delay_expense",
                detail="Defer non-critical supplier payments until cash stabilizes.",
                action_score=round(action_score, 3),
            )
        )

    if risk_probability > 0.2 and receivables > 5000:
        actions.append(
            RecommendedAction(
                type="suggest_credit",
                detail="Consider a short-term working capital line while receivables clear.",
                amount=round(receivables * 0.25, 2),
                action_score=round(action_score, 3),
            )
        )

    if risk_probability > RISK_ALERT_THRESHOLD:
        actions.append(
            RecommendedAction(
                type="reduce_expenses",
                detail="Review supplier and personal categories for 10–20% near-term reduction.",
                action_score=round(action_score, 3),
            )
        )

    targets = _pending_sale_collection_targets(df) if risk_probability > RISK_ALERT_THRESHOLD else []
    for t in targets:
        link = paytm_service.create_payment_link(t["amount"], t["customer"])
        msg = paytm_service.send_payment_request(t["customer"], t["amount"], link=link)
        actions.append(
            RecommendedAction(
                type="collect_payment",
                amount=t["amount"],
                link=link,
                customer=t["customer"],
                detail=msg,
                action_score=round(action_score, 3),
            )
        )

    return alerts, actions


def build_dashboard_response(
    df: pd.DataFrame,
    risk_probability: float,
    min_cash: float,
    max_cash: float,
    profile: dict,
    future_balances: list[list[float]],
    fraud_summary: dict,
    user_id: str = "demo_user",
    source_mix: dict[str, int] | None = None,
    enriched_profile: dict | None = None,
    active_modules: list[dict] | None = None,
    inventory_metrics: dict | None = None,
    system_state: dict | None = None,
    onboarding: dict | None = None,
) -> DashboardResponse:
    last_bal = float(df["balance"].iloc[-1]) if len(df) else 0.0
    receivables = _estimate_receivables(df)
    cash_gap = max(0.0, -float(min_cash))
    action_score = _compute_action_score(
        risk_probability, receivables, min_cash, last_bal, onboarding=onboarding
    )

    enr = enriched_profile or {}
    bp = BusinessProfile(
        average_transaction_size=profile["average_transaction_size"],
        number_of_transactions=profile["number_of_transactions"],
        credit_debit_ratio=profile["credit_debit_ratio"],
        credit_count=profile.get("credit_count", 0),
        debit_count=profile.get("debit_count", 0),
        formality_score=float(enr.get("formality_score", profile.get("formality_score", 0.0))),
        trust_score=float(enr.get("trust_score", profile.get("trust_score", 0.0))),
    )

    alerts, recommended_actions = build_alerts_and_actions(
        risk_probability,
        min_cash,
        df,
        fraud_summary,
        action_score,
        receivables,
        cash_gap,
        user_id=user_id,
        onboarding=onboarding,
    )

    mods = [
        ActiveModule(name=m["name"], priority=float(m["priority"]))
        for m in (active_modules or [])
        if isinstance(m, dict) and "name" in m and "priority" in m
    ]

    return DashboardResponse(
        risk_probability=risk_probability,
        action_score=action_score,
        min_cash=min_cash,
        max_cash=max_cash,
        cash_flow=_df_to_cash_flow(df),
        profile=bp,
        transactions=_df_to_transactions(df),
        future_balances=future_balances,
        alerts=alerts,
        recommended_actions=recommended_actions,
        fraud_summary=fraud_summary,
        receivables=receivables,
        cash_gap=cash_gap,
        source_mix=source_mix or {},
        business_profile=enr,
        active_modules=mods,
        inventory_state=inventory_metrics or {},
        system_state=system_state or {},
    )
