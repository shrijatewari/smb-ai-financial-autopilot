"""GST / compliance stubs driven by onboarding turnover."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth.deps import get_current_user_optional
from prisma.models import User
from services import state_store
from services.onboarding_persistence import ensure_user_business_context_loaded

router = APIRouter()


class GstComplianceOut(BaseModel):
    gst_due: float
    due_date: str
    gst_registered: bool
    note: str


def _turnover_to_monthly_inr(onboarding: dict) -> float:
    t = str(onboarding.get("monthly_turnover_range", "")).lower()
    if t in ("under_50k", "under-50k"):
        return 35_000.0
    if t in ("50k_to_5l", "50k-5l"):
        return 250_000.0
    if t in ("5l_to_50l", "5l-50l"):
        return 2_500_000.0
    if t in ("50l_plus", "50l+"):
        return 8_000_000.0
    if "0-5" in t or ("under" in t and "50k" not in t):
        return 200_000.0
    if "5-25" in t or ("5l" in t and "50" not in t and "50l" not in t):
        return 1_000_000.0
    if "25" in t or "1cr" in t or "cr" in t or "50l" in t:
        return 5_000_000.0
    return 500_000.0


@router.get("/gst", response_model=GstComplianceOut)
async def get_gst_compliance(user: User | None = Depends(get_current_user_optional)):
    """Approximate output GST liability for next filing window (demo)."""
    uid = user.id if user else None
    if user is not None:
        await ensure_user_business_context_loaded(user.id)
    ob = state_store.get_onboarding(uid) or {}
    registered = bool(ob.get("gst_registered"))
    monthly = _turnover_to_monthly_inr(ob)
    # Assume ~60% of turnover taxable at 18% for demo
    taxable_base = monthly * 0.6
    gst_due = round(taxable_base * 0.18, 2) if registered else 0.0
    due = date.today() + timedelta(days=20)
    note = (
        "Estimated from onboarding turnover; connect bank and invoices for filing-grade numbers."
        if registered
        else "GST not indicated – enable GST in onboarding for estimates."
    )
    return GstComplianceOut(
        gst_due=gst_due,
        due_date=due.isoformat(),
        gst_registered=registered,
        note=note,
    )
