"""Business onboarding – persists intelligence layer inputs (per authenticated user)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from auth.deps import get_current_user
from prisma.models import User
from models.business_profile_engine import compute_business_vector, compute_formality_score, compute_trust_score
from schemas.onboarding_schema import OnboardingRequest, OnboardingResponse
from services import ingestion_service, state_store
from services.module_selector import infer_profile_type_label, select_modules
from services.onboarding_persistence import (
    ensure_user_business_context_loaded,
    persist_user_onboarding_and_snapshot,
    upsert_normalized_business_profile,
)

router = APIRouter(tags=["onboarding"])


@router.get("/onboarding")
async def get_onboarding_state(user: User = Depends(get_current_user)):
    """Current stored onboarding for the logged-in user (memory + DB)."""
    await ensure_user_business_context_loaded(user.id)
    return state_store.get_onboarding(user.id) or {}


@router.post("/onboarding", response_model=OnboardingResponse)
async def post_onboarding(body: OnboardingRequest, user: User = Depends(get_current_user)):
    """
    Store onboarding payload and return formality / trust / vector / module preview.
    Persists to PostgreSQL so the profile survives server restarts.
    """
    data = body.model_dump()
    state_store.set_onboarding(data, user_id=user.id)

    f = compute_formality_score(data)
    t = compute_trust_score(data, ingestion_service.get_source_mix() or {})
    vec = compute_business_vector(data, None, f)
    modules = select_modules(vec, data)
    profile_type = infer_profile_type_label(data, vec)

    snapshot = {
        "formality_score": f,
        "trust_score": t,
        "business_vector": vec,
        "active_modules": modules,
        "profile_type": profile_type,
    }
    state_store.set_business_profile_snapshot(snapshot, user_id=user.id)

    await persist_user_onboarding_and_snapshot(user.id, data, snapshot)
    await upsert_normalized_business_profile(user.id, data, f, t)

    return OnboardingResponse(
        status="ok",
        message="Onboarding saved. Open GET /dashboard for merged intelligence.",
        formality_score=f,
        trust_score=t,
        business_vector=vec,
        active_modules=modules,
        profile_type=profile_type,
    )
