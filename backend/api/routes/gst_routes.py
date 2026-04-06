"""GST liability forecasting – summary for UI and Monte Carlo alignment."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from auth.deps import get_current_user
from integrations.gst import get_gst_summary_for_user
from prisma.models import User

router = APIRouter()


@router.get("/summary")
async def gst_summary(user: User = Depends(get_current_user)):
    """Registered GSTIN, next due date, estimated GSTR-3B-style outflow, warning flag (due within 14 days)."""
    return await get_gst_summary_for_user(user.id)
