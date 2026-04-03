"""
Optional Redis mirror of the engine snapshot (global_state).

When REDIS_URL is set and REDIS_SNAPSHOT_ENABLED is true (default), each pipeline tick
writes JSON to `smb:engine_snapshot:v1`. Reads prefer Redis so multiple workers / SSE
subscribers can share one hot snapshot without relying on process-local memory only.
"""

from __future__ import annotations

import json
import os
from typing import Any

KEY = os.environ.get("REDIS_SNAPSHOT_KEY", "smb:engine_snapshot:v1")
TTL_SEC = int(os.environ.get("REDIS_SNAPSHOT_TTL_SEC", "120"))


def _client():
    url = (os.environ.get("REDIS_URL") or "").strip()
    if not url:
        return None
    try:
        import redis

        return redis.Redis.from_url(url, decode_responses=True)
    except Exception:
        return None


def snapshot_enabled() -> bool:
    if (os.environ.get("REDIS_SNAPSHOT_ENABLED") or "true").strip().lower() in ("0", "false", "no"):
        return False
    return _client() is not None


def publish_snapshot(payload: dict[str, Any]) -> None:
    if not snapshot_enabled():
        return
    r = _client()
    if r is None:
        return
    try:
        body = json.dumps(payload, default=str)
        r.setex(KEY, TTL_SEC, body)
    except Exception:
        pass


def fetch_snapshot() -> dict[str, Any] | None:
    if not snapshot_enabled():
        return None
    r = _client()
    if r is None:
        return None
    try:
        raw = r.get(KEY)
        if not raw:
            return None
        return json.loads(raw)
    except Exception:
        return None
