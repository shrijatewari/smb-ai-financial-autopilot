"""Pydantic models for transaction payloads."""

from __future__ import annotations

from pydantic import BaseModel, Field


class TransactionRow(BaseModel):
    """Single row as returned to clients (JSON-serializable)."""

    date: str
    amount: float = Field(description="Unsigned magnitude; sign implied by type")
    type: str = Field(description="credit or debit")
    description: str
    category: str
    balance: float | None = None
    z_score: float | None = None
    is_suspicious: bool | None = None
    source: str | None = Field(None, description="csv | paytm | sms | ocr")

    model_config = {"extra": "ignore"}


class UploadSummary(BaseModel):
    rows: int
    total_amount_signed: float = Field(description="Net sum of signed cash impacts")
    message: str
