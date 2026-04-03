"""
Parse Indian-style bank / UPI SMS into structured transactions.

Handles keywords: credited, debited, UPI, Rs., INR, IMPS, NEFT, etc.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any

_AMT_RE = re.compile(r"(?:Rs\.?|INR|MRP|₹)\s*([\d,]+(?:\.\d{1,2})?)", re.I)
# "500 received from Rahul", "1200 paid to supplier"
_AMT_LOOSE = re.compile(
    r"\b([\d,]+(?:\.\d{1,2})?)\s+(?:received|credited|deposited|paid|sent|debited|from|to)\b",
    re.I,
)
_DATE_NUM = re.compile(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b")


def _parse_amount(text: str) -> float | None:
    for rx in (_AMT_RE, _AMT_LOOSE):
        m = rx.search(text)
        if m:
            raw = m.group(1).replace(",", "")
            try:
                return float(raw)
            except ValueError:
                continue
    return None


def _parse_date(text: str) -> datetime | None:
    m = _DATE_NUM.search(text)
    if not m:
        return None
    d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if y < 100:
        y += 2000
    try:
        return datetime(y, mo, d)
    except ValueError:
        return None


def _infer_credit_debit(text: str) -> str:
    t = text.lower()
    if any(
        x in t
        for x in ("credited", "credit", "received", "deposited", "refund", "cashback")
    ):
        return "credit"
    if any(x in t for x in ("debited", "debit", "paid", "sent", "deducted", "withdrawn")):
        return "debit"
    return "debit"


def parse_sms_text(raw: str) -> list[dict[str, Any]]:
    """
    Parse one or more SMS blobs (split by blank lines).
    Returns rows: date, amount, type, description, _source.
    """
    if not raw or not str(raw).strip():
        return []

    chunks = re.split(r"\n\s*\n+", raw.strip())
    rows: list[dict[str, Any]] = []
    today = datetime.now()

    for chunk in chunks:
        chunk = chunk.strip()
        if len(chunk) < 5:
            continue
        amt = _parse_amount(chunk)
        if amt is None:
            continue
        dt = _parse_date(chunk) or today
        td = _infer_credit_debit(chunk)
        desc = f"SMS: {chunk[:120].replace(chr(10), ' ')}"
        rows.append(
            {
                "date": dt.strftime("%Y-%m-%d"),
                "amount": float(amt),
                "type": "credit" if td == "credit" else "debit",
                "description": desc,
                "_source": "sms",
            }
        )

    return rows


def parse_sms_batch(text: str) -> list[dict[str, Any]]:
    """Alias for raw paste."""
    return parse_sms_text(text)
