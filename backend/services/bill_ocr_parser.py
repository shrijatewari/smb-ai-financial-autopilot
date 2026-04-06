"""Heuristic parsing of OCR text from retail bills – line items, total, phone, name."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any


def _money(s: str) -> float | None:
    s = s.replace(",", "").strip()
    if not s:
        return None
    try:
        return float(s)
    except ValueError:
        return None


def parse_bill_ocr_text(text: str) -> dict[str, Any]:
    """
    Extract line items, total, optional 10-digit India phone, and a guess at customer name.
    Never raises – returns best-effort structure with empty lists on failure.
    """
    raw = (text or "").replace("\r", "\n")
    lines = [ln.strip() for ln in raw.split("\n") if ln.strip()]
    out: dict[str, Any] = {
        "line_items": [],
        "total_amount": None,
        "customer_phone": None,
        "customer_name": None,
        "bill_number": None,
        "timestamp": None,
    }

    # Phone: first plausible 10-digit (India mobile)
    for m in re.finditer(r"(?<!\d)(\d{10})(?!\d)", raw):
        digits = m.group(1)
        if digits[0] in "6789":
            out["customer_phone"] = digits
            break

    # Bill # / invoice #
    bn = re.search(r"(?:bill|invoice|inv)[\s#:No.]*([A-Za-z0-9\-_/]+)", raw, re.I)
    if bn:
        out["bill_number"] = bn.group(1).strip()[:120]

    # Date
    dm = re.search(
        r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b|\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b",
        raw,
    )
    if dm:
        try:
            if dm.group(1):
                d, mo, y = int(dm.group(1)), int(dm.group(2)), int(dm.group(3))
                if y < 100:
                    y += 2000
                out["timestamp"] = datetime(y, mo, d).isoformat()
            else:
                y, mo, d = int(dm.group(4)), int(dm.group(5)), int(dm.group(6))
                out["timestamp"] = datetime(y, mo, d).isoformat()
        except (ValueError, TypeError):
            pass

    # Total / grand total / amount due
    for pat in (
        r"(?:grand\s*)?total|amount\s*due|net\s*payable|payable",
        r"total",
    ):
        tm = re.search(
            rf"(?:{pat})[^\d₹]*(?:₹|Rs\.?|INR)?\s*([\d,]+\.?\d*)",
            raw,
            re.I | re.MULTILINE,
        )
        if tm:
            v = _money(tm.group(1))
            if v is not None and v > 0:
                out["total_amount"] = v
                break

    # Line items: name ... qty ... price OR qty x name @ price
    seen: set[str] = set()
    # Pattern A: "Item name    2    40.00" or "Item   2   40"
    line_pat = re.compile(
        r"^(.{2,80}?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*$",
        re.I,
    )
    for ln in lines:
        if len(ln) < 4:
            continue
        low = ln.lower()
        if any(x in low for x in ("total", "subtotal", "tax", "gst", "thank", "visit")):
            continue
        m = line_pat.match(ln)
        if m:
            name = m.group(1).strip()
            qty = float(m.group(2))
            price = float(m.group(3))
            if qty <= 0 or price < 0:
                continue
            key = f"{name.lower()}|{qty}|{price}"
            if key in seen:
                continue
            seen.add(key)
            unit_price = price / qty if qty else price
            out["line_items"].append(
                {"name": name[:200], "qty": qty, "unit_price": round(unit_price, 2)}
            )

    # Pattern B: "2 x Product  40"
    pat_b = re.compile(r"^(\d+(?:\.\d+)?)\s*[x×]\s*(.+?)\s+(\d+(?:\.\d+)?)\s*$", re.I)
    for ln in lines:
        m = pat_b.match(ln.strip())
        if m:
            qty = float(m.group(1))
            name = m.group(2).strip()
            tot = float(m.group(3))
            if qty <= 0:
                continue
            key = f"{name.lower()}|{qty}|{tot}"
            if key in seen:
                continue
            seen.add(key)
            out["line_items"].append(
                {"name": name[:200], "qty": qty, "unit_price": round(tot / qty, 2)}
            )

    # Guess name from first non-numeric short line (header)
    for ln in lines[:8]:
        if re.match(r"^[\d\s₹.,/-]+$", ln):
            continue
        if len(ln) > 3 and len(ln) < 60 and not re.search(r"\d{10}", ln):
            if "bill" not in ln.lower() and "tax" not in ln.lower():
                out["customer_name"] = ln.strip()[:120]
                break

    if out["total_amount"] is None and out["line_items"]:
        out["total_amount"] = round(
            sum(float(x["qty"]) * float(x["unit_price"]) for x in out["line_items"]), 2
        )

    if not out["bill_number"]:
        out["bill_number"] = f"OCR-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"

    return out
