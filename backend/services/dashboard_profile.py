"""Resolve modules + profile label for a user (onboarding + stored snapshot + documents)."""

from __future__ import annotations

from typing import Any

from models.business_profile_engine import compute_business_vector, compute_formality_score
from services import rl_engine, state_store
from services.module_selector import infer_profile_type_label, select_modules


def _apply_rl_module_weights(modules: list[dict[str, Any]], user_id: int) -> list[dict[str, Any]]:
    """Boost priority for modules the user clicks often (lightweight personalization)."""
    w = rl_engine.get_module_weights(user_id)
    if not w or not modules:
        return modules
    out: list[dict[str, Any]] = []
    for m in modules:
        mm = dict(m)
        name = str(mm.get("name") or "")
        if name in w:
            bump = min(0.2, 0.04 * abs(float(w[name])))
            mm["priority"] = round(min(1.0, float(mm.get("priority", 0)) + bump), 2)
        out.append(mm)
    return sorted(out, key=lambda x: -float(x.get("priority", 0)))


def resolve_user_dashboard_profile(user_id: int) -> tuple[list[dict[str, Any]], str, dict[str, Any] | None]:
    """
    Modules and profile type for the signed-in user.

    Prefer stored business_profile_snapshot; if missing but onboarding exists, recompute.
    """
    prof = state_store.get_business_profile_snapshot(user_id)
    doc = state_store.get_document_profile(user_id)

    if prof and prof.get("active_modules"):
        mods = _apply_rl_module_weights(list(prof["active_modules"]), user_id)
        return (
            mods,
            str(prof.get("profile_type") or ""),
            doc,
        )

    ob = state_store.get_onboarding(user_id)
    if not ob:
        return ([], "", doc)

    f = compute_formality_score(ob)
    vec = compute_business_vector(ob, None, f)
    modules = _apply_rl_module_weights(select_modules(vec, ob), user_id)
    ptype = infer_profile_type_label(ob, vec)
    return (modules, ptype, doc)
