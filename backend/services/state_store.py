"""In-memory store for onboarding, business profile snapshots, Paytm connection (per-user + legacy global)."""

from __future__ import annotations

from typing import Any

# Legacy single-tenant (used when no user_id)
_onboarding: dict[str, Any] | None = None
_business_profile_snapshot: dict[str, Any] | None = None

# Per-user: user_id -> dict
_user_onboarding: dict[int, dict[str, Any]] = {}
_user_profile_snapshot: dict[int, dict[str, Any]] = {}
_user_paytm: dict[int, dict[str, Any]] = {}
# Document intelligence (OCR-derived profile); None key = last upload mirrored for global engine
_document_profiles: dict[int | None, dict[str, Any]] = {}


def get_onboarding(user_id: int | None = None) -> dict[str, Any] | None:
    if user_id is not None and user_id in _user_onboarding:
        return dict(_user_onboarding[user_id])
    return dict(_onboarding) if _onboarding is not None else None


def set_onboarding(data: dict[str, Any], user_id: int | None = None) -> None:
    global _onboarding
    payload = dict(data)
    if user_id is not None:
        _user_onboarding[user_id] = payload
    else:
        _onboarding = payload


def clear_onboarding() -> None:
    global _onboarding
    _onboarding = None


def get_business_profile_snapshot(user_id: int | None = None) -> dict[str, Any] | None:
    if user_id is not None and user_id in _user_profile_snapshot:
        return dict(_user_profile_snapshot[user_id])
    return dict(_business_profile_snapshot) if _business_profile_snapshot is not None else None


def set_business_profile_snapshot(data: dict[str, Any], user_id: int | None = None) -> None:
    global _business_profile_snapshot
    payload = dict(data)
    if user_id is not None:
        _user_profile_snapshot[user_id] = payload
    else:
        _business_profile_snapshot = payload


def get_paytm_state(user_id: int) -> dict[str, Any] | None:
    return dict(_user_paytm[user_id]) if user_id in _user_paytm else None


def set_paytm_connected(user_id: int, account_id: str) -> None:
    _user_paytm[user_id] = {"status": "connected", "account": account_id}


def set_document_profile(user_id: int | None, data: dict[str, Any]) -> None:
    _document_profiles[user_id] = dict(data)


def get_document_profile(user_id: int | None) -> dict[str, Any] | None:
    if user_id in _document_profiles:
        return dict(_document_profiles[user_id])
    return None


def reset_all() -> None:
    global _onboarding, _business_profile_snapshot
    _onboarding = None
    _business_profile_snapshot = None
    _user_onboarding.clear()
    _user_profile_snapshot.clear()
    _user_paytm.clear()
    _document_profiles.clear()
