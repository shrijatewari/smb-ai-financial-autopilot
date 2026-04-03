"""Forecast and risk prediction payloads."""

from __future__ import annotations

from pydantic import BaseModel, Field


class CashflowForecastResponse(BaseModel):
    current_cash: float
    horizon_days: int
    expected_cash_end: float
    rolling_revenue_mean: float
    rolling_revenue_variance: float
    probability_of_negative_cash: float = Field(ge=0.0, le=1.0)
    worst_case_cash: float
    best_case_cash: float
    risk_explanation: str


class MonteCarloResponse(BaseModel):
    probability_of_negative_cash: float
    worst_case_cash: float
    best_case_cash: float
    expected_cash: float
    horizon_days: int
    paths_simulated: int
    narrative: str
