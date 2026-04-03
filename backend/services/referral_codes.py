"""Unique referral codes for the growth loop."""

from __future__ import annotations

import secrets
import string

from db.prisma_client import prisma

_ALPHABET = string.ascii_uppercase + string.digits


async def ensure_referral_code(user_id: int) -> str:
    user = await prisma.user.find_unique(where={"id": user_id})
    if user is None:
        raise ValueError("user not found")
    existing = getattr(user, "referral_code", None)
    if existing:
        return str(existing)
    for _ in range(32):
        code = "".join(secrets.choice(_ALPHABET) for _ in range(8))
        try:
            await prisma.user.update(where={"id": user_id}, data={"referral_code": code})
            return code
        except Exception:
            continue
    raise RuntimeError("Could not allocate referral code")
