"""In-memory rate limit for WhatsApp bot replies (20 / user / hour)."""

from __future__ import annotations

import time
from collections import defaultdict

_MAX_PER_HOUR = 20
_WINDOW_SEC = 3600

_buckets: dict[int, list[float]] = defaultdict(list)


def allow_reply(user_id: int) -> bool:
    now = time.time()
    cutoff = now - _WINDOW_SEC
    arr = _buckets[user_id]
    arr[:] = [t for t in arr if t > cutoff]
    if len(arr) >= _MAX_PER_HOUR:
        return False
    arr.append(now)
    return True
