"""Dashboard API response models."""

from __future__ import annotations

from pydantic import BaseModel, Field

from schemas.transaction_schema import TransactionRow


class BusinessProfile(BaseModel):
    average_transaction_size: float
    number_of_transactions: int
    credit_debit_ratio: float
    credit_count: int = 0
    debit_count: int = 0
    formality_score: float = Field(0.0, ge=0.0, le=1.0)
    trust_score: float = Field(0.0, ge=0.0, le=1.0)


class CashFlowPoint(BaseModel):
    date: str
    balance: float
    amount_signed: float


class ActiveModule(BaseModel):
    name: str
    priority: float = Field(ge=0.0, le=1.0)


class RecommendedAction(BaseModel):
    """Actionable item (e.g. collect via Paytm link, reduce spend)."""

    type: str = Field(
        description="collect_payment | reduce_expenses | delay_expense | suggest_credit | notify"
    )
    amount: float | None = None
    link: str | None = None
    customer: str | None = None
    detail: str | None = None
    action_score: float | None = None


class DashboardResponse(BaseModel):
    risk_probability: float = Field(ge=0.0, le=1.0)
    action_score: float = Field(0.0, ge=0.0, le=1.0, description="Composite urgency for interventions")
    min_cash: float = Field(description="Minimum simulated balance (INR) across paths/days (stress)")
    max_cash: float = Field(description="Maximum simulated balance (INR) across paths/days")
    cash_flow: list[CashFlowPoint]
    profile: BusinessProfile
    transactions: list[TransactionRow]
    future_balances: list[list[float]] = Field(
        default_factory=list,
        description="Monte Carlo paths (each path is daily balances for the horizon)",
    )
    alerts: list[str] = Field(default_factory=list)
    recommended_actions: list[RecommendedAction] = Field(default_factory=list)
    fraud_summary: dict = Field(default_factory=dict)
    receivables: float = Field(0.0, description="Heuristic sale-category inflows (INR)")
    cash_gap: float = Field(0.0, description="Stress shortfall from worst-case simulation (INR)")
    source_mix: dict[str, int] = Field(
        default_factory=dict,
        description="Row counts by ingestion channel: csv, paytm, sms, ocr",
    )
    business_profile: dict = Field(
        default_factory=dict,
        description="Enriched business intelligence (onboarding + ledger + vector)",
    )
    active_modules: list[ActiveModule] = Field(default_factory=list)
    inventory_state: dict = Field(default_factory=dict)
    system_state: dict = Field(default_factory=dict)
