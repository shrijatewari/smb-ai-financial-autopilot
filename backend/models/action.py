"""Decision and execution action models."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class DecisionAction(BaseModel):
    action: Literal["collect_payment", "reduce_expense", "offer_credit_line", "delay_payable", "notify"]
    priority: Literal["low", "medium", "high", "critical"]
    reason: str
    confidence: float = Field(ge=0.0, le=1.0, description="Model confidence in this recommendation")
    metadata: dict = Field(default_factory=dict)


class ExecuteActionRequest(BaseModel):
    action: str
    amount: float | None = None
    customer: str | None = None
    reference: str | None = None


class ExecuteActionResponse(BaseModel):
    status: str
    message: str
    payment_link: str | None = None
    correlation_id: str
