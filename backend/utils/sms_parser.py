"""SMS parsing – delegates to canonical parser used by ingestion."""

from __future__ import annotations

from typing import Any

from services import sms_parser as _sms


def parse_sms_batch(text: str) -> list[dict[str, Any]]:
    """Parse one or more SMS blobs into normalized transaction dicts."""
    return _sms.parse_sms_batch(text)


def parse_sms_text(raw: str) -> list[dict[str, Any]]:
    return _sms.parse_sms_text(raw)
