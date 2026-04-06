"""Shared GET /system/state payload – used by HTTP routes, SSE, and scheduled jobs."""

from __future__ import annotations

import copy

from prisma.models import User
from integrations.gst import get_gst_summary_for_user
from services import state_store
from services.dashboard_context import build_dashboard_context
from services.dashboard_profile import resolve_user_dashboard_profile
from services.onboarding_persistence import ensure_user_business_context_loaded
from state.global_state import get_snapshot


async def build_system_snapshot(user: User | None) -> dict:
    """
    Same shape as GET /system/state – global engine mirror plus per-user dashboard context when authenticated.
    """
    snap = copy.deepcopy(get_snapshot())
    if user is None:
        return snap

    await ensure_user_business_context_loaded(user.id)
    modules, profile_type, doc_prof = resolve_user_dashboard_profile(user.id)
    snap["modules"] = modules
    snap["profile_type"] = profile_type
    snap["document_profile"] = doc_prof
    ob = state_store.get_onboarding(user.id)
    dc = build_dashboard_context(snap, ob)
    try:
        dc["gst"] = await get_gst_summary_for_user(user.id)
    except Exception:
        dc["gst"] = {
            "gst_registered": False,
            "show_warning": False,
            "estimated_liability_inr": 0.0,
            "next_due_date": None,
            "error": "gst_unavailable",
        }
    snap["dashboard_context"] = dc
    return snap
