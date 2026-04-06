"""Load / save business onboarding + business-profile snapshot to PostgreSQL (per user)."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from prisma.fields import Json

from db.prisma_client import prisma
from services import state_store


def _dec(x: float) -> Decimal:
    return Decimal(str(round(float(x), 6)))


def _as_dict(v: Any) -> dict[str, Any]:
    if isinstance(v, dict):
        return dict(v)
    return {}


async def user_has_completed_onboarding(user_id: int) -> bool:
    row = await prisma.onboardingprofile.find_unique(where={"user_id": user_id})
    return row is not None


async def ensure_user_business_context_loaded(user_id: int) -> None:
    """If in-memory onboarding is empty, hydrate from DB (after a cold start or new worker)."""
    if state_store.get_onboarding(user_id) is not None:
        return
    row = await prisma.onboardingprofile.find_unique(where={"user_id": user_id})
    if row is None:
        return
    payload = _as_dict(row.payload)
    state_store.set_onboarding(payload, user_id=user_id)
    if row.snapshot is not None:
        state_store.set_business_profile_snapshot(_as_dict(row.snapshot), user_id=user_id)


async def upsert_normalized_business_profile(
    user_id: int,
    onboarding: dict[str, Any],
    formality_score: float,
    trust_score: float,
) -> None:
    """Persist columns on `business_profiles` (dashboard / judges – not only JSON blobs)."""
    pm = onboarding.get("payment_mix") or {}
    cash = float(pm.get("cash", 0.5))
    dig = float(pm.get("digital", 0.5))
    s = cash + dig
    if s <= 0:
        cash, dig = 0.5, 0.5
    else:
        cash, dig = cash / s, dig / s

    gi = str(onboarding.get("gstin") or "").strip().upper() or None
    if gi:
        gi = gi[:16]

    payload = {
        "business_type": str(onboarding.get("revenue_model") or "hybrid")[:32],
        "monthly_turnover_range": str(onboarding.get("monthly_turnover_range") or "")[:32],
        "payment_mix_cash": _dec(cash),
        "payment_mix_digital": _dec(dig),
        "inventory_type": str(onboarding.get("inventory_type") or "low")[:32],
        "credit_usage": str(onboarding.get("credit_usage") or "none")[:32],
        "customer_type": str(onboarding.get("customer_type") or "repeat")[:32],
        "gst_registered": bool(onboarding.get("gst_registered")),
        "gstin": gi,
        "formality_score": _dec(formality_score),
        "trust_score": _dec(trust_score),
    }
    await prisma.businessprofile.upsert(
        where={"user_id": user_id},
        data={
            "create": {"user_id": user_id, **payload},
            "update": payload,
        },
    )


async def persist_user_onboarding_and_snapshot(
    user_id: int,
    onboarding_payload: dict[str, Any],
    snapshot: dict[str, Any],
) -> None:
    """Upsert onboarding form + computed snapshot to the database."""
    await prisma.onboardingprofile.upsert(
        where={"user_id": user_id},
        data={
            "create": {
                "user_id": user_id,
                "payload": Json(onboarding_payload),
                "snapshot": Json(snapshot),
            },
            "update": {
                "payload": Json(onboarding_payload),
                "snapshot": Json(snapshot),
            },
        },
    )
