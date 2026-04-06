"""Onboarding API models."""

from __future__ import annotations

from pydantic import BaseModel, Field, model_validator


class PaymentMix(BaseModel):
    cash: float = Field(0.5, ge=0.0, le=1.0)
    digital: float = Field(0.5, ge=0.0, le=1.0)

    @model_validator(mode="after")
    def _normalize(self):
        s = float(self.cash + self.digital)
        if s <= 0:
            self.cash = 0.5
            self.digital = 0.5
        else:
            self.cash = float(self.cash) / s
            self.digital = float(self.digital) / s
        return self


class OnboardingRequest(BaseModel):
    business_type: str = Field(..., description="Free-text industry / segment label")
    revenue_model: str = Field(..., description="product | service | hybrid")
    monthly_turnover_range: str = Field(
        ...,
        description="under_50k | 50k_to_5L | 5L_to_50L | 50L_plus (or legacy 0-5L, 5-25L, …)",
    )
    num_employees: int = Field(0, ge=0, le=100_000)
    inventory_type: str = Field(..., description="none | low | high | high_value")
    credit_usage: str = Field(..., description="none | informal | formal")
    payment_mix: PaymentMix
    gst_registered: bool = False
    gstin: str | None = Field(
        None,
        max_length=16,
        description="Optional 15-char India GSTIN when gst_registered (stored on BusinessProfile).",
    )
    has_bank_data: bool = False
    has_invoices: bool = False
    notes: str | None = Field(None, description="Optional notes or document reference")
    customer_type: str = Field(
        "repeat",
        description="one_time | repeat | subscription – drives customer insights module",
    )
    data_sources: list[str] = Field(
        default_factory=list,
        description="Optional: paytm, bank, sms – used for trust / confidence",
    )
    literacy_preference: str = Field(
        "standard",
        description="minimal (icons + voice) | standard – UI density for low-literacy users",
    )


class OnboardingResponse(BaseModel):
    status: str = "ok"
    message: str = "Onboarding saved"
    formality_score: float = Field(0.0, ge=0.0, le=1.0)
    trust_score: float = Field(0.0, ge=0.0, le=1.0)
    business_vector: list[float] = Field(default_factory=list)
    active_modules: list[dict] = Field(default_factory=list)
    profile_type: str = Field("", description="Archetype label e.g. high_inventory_cash_heavy_credit_active")
