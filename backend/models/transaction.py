"""Normalized transaction representation."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class NormalizedTransaction(BaseModel):
    """Canonical ledger row after ingestion."""

    amount: float = Field(..., description="Absolute magnitude in account currency (INR)")
    type: str = Field(..., description="credit | debit | or gateway-specific label")
    timestamp: datetime
    source: str = Field(..., description="csv | sms | ocr | paytm | api")
    description: str | None = None
    external_id: str | None = None


class ClassifiedTransaction(BaseModel):
    """Transaction with business classification."""

    amount: float
    type: str
    timestamp: datetime
    source: str
    category: Literal["revenue", "expense", "loan", "supplier", "unknown"]
    confidence: float = Field(ge=0.0, le=1.0)
