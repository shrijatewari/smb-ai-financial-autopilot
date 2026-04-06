"""Append-only audit log for sensitive flows."""

from __future__ import annotations

from typing import Any

from db.prisma_client import prisma
from prisma.fields import Json


async def log_audit(
    *,
    user_id: int | None,
    actor: str,
    action: str,
    resource: str | None = None,
    metadata: dict[str, Any] | None = None,
    ip: str | None = None,
) -> None:
    try:
        await prisma.auditlog.create(
            data={
                "user_id": user_id,
                "actor": actor[:32],
                "action": action[:128],
                "resource": resource[:255] if resource else None,
                "metadata": Json(metadata or {}),
                "ip": ip[:64] if ip else None,
            }
        )
    except Exception:
        pass
