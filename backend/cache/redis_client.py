"""
Redis client placeholder.

Set REDIS_URL (e.g. redis://localhost:6379/0) to enable; otherwise operations are no-ops.
"""

from __future__ import annotations

import os
from typing import Any

_REDIS_URL = os.getenv("REDIS_URL", "").strip()
_client: Any = None

try:
    if _REDIS_URL:
        import redis

        _client = redis.Redis.from_url(_REDIS_URL, decode_responses=True)
except Exception:
    _client = None


def cache_get(key: str) -> str | None:
    if _client is None:
        return None
    try:
        return _client.get(key)
    except Exception:
        return None


def cache_set(key: str, value: str, ttl_seconds: int = 300) -> None:
    if _client is None:
        return
    try:
        _client.setex(key, ttl_seconds, value)
    except Exception:
        pass
