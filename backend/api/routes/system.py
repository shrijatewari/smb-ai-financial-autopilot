"""Single read model: latest engine snapshot."""

from __future__ import annotations

import copy

from fastapi import APIRouter, Depends

from auth.deps import get_current_user_optional
from prisma.models import User
from services.dashboard_profile import resolve_user_dashboard_profile
from services.onboarding_persistence import ensure_user_business_context_loaded
from state.global_state import get_snapshot

router = APIRouter()


@router.get("/state")
async def get_system_state(user: User | None = Depends(get_current_user_optional)):
    """
    Live system snapshot (updated every few seconds by the background engine).

    When authenticated, **modules**, **profile_type**, and **document_profile** come from **this user's**
    onboarding + document intelligence — not the global engine-only mirror. Cash/risk/forecast still come
    from the shared control-plane tick.
    """
    snap = copy.deepcopy(get_snapshot())
    if user is None:
        return snap

    await ensure_user_business_context_loaded(user.id)
    modules, profile_type, doc_prof = resolve_user_dashboard_profile(user.id)
    snap["modules"] = modules
    snap["profile_type"] = profile_type
    snap["document_profile"] = doc_prof
    return snap
