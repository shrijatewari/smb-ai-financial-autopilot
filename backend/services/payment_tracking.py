"""
In-memory store for generated payment links and lifecycle status.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

_records: dict[str, dict[str, Any]] = {}


def register_link(
    link: str,
    amount: float,
    customer: str,
    status: str = "pending",
) -> str:
    """Store a payment link; returns tracking id."""
    pid = str(uuid.uuid4())[:12]
    _records[pid] = {
        "id": pid,
        "link": link,
        "amount": float(amount),
        "customer": customer,
        "status": status,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    return pid


def mark_sent(link_or_id: str) -> bool:
    """Mark pending as sent (match by full URL or id prefix)."""
    for rec in _records.values():
        if rec["link"] == link_or_id or rec["id"] == link_or_id:
            rec["status"] = "sent"
            rec["sent_at"] = datetime.now(timezone.utc).isoformat()
            return True
    return False


def list_all() -> list[dict[str, Any]]:
    return list(_records.values())


def get_by_id(pid: str) -> dict[str, Any] | None:
    return _records.get(pid)
