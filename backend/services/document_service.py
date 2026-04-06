"""
Rule-based business intelligence from OCR text (invoices, GST, bills).

Not random: keyword scoring, amount statistics, vendor repetition, payment-channel cues.
"""

from __future__ import annotations

import re
from collections import Counter
from datetime import datetime
from typing import Any

# Keyword → coarse business category (highest score wins)
_BUSINESS_SCORES: dict[str, list[str]] = {
    "restaurant": ["restaurant", "cafe", "canteen", "dining", "food court", "kitchen", "menu", "chef"],
    "retail": ["retail", "kirana", "supermarket", "mart", "general store", "shop", "emporium", "outlet"],
    "services": ["services", "consulting", "clinic", "salon", "repair", "software", "professional fee"],
    "manufacturing": ["manufacturing", "factory", "production", "work order", "raw material", "unit"],
    "electronics": ["electronics", "mobile", "laptop", "computer", "gadget", "warranty"],
}

_AMOUNTS = re.compile(
    r"(?:₹|Rs\.?|INR|MRP)\s*([\d,]+(?:\.\d{1,2})?)|\b([\d,]+(?:\.\d{1,2})?)\s*(?:Rs\.?|INR|rupees?)\b",
    re.I,
)
_DATE_HINTS = re.compile(
    r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b|\b(\d{4})[/-](\d{1,2})[/-](\d{1,2})\b"
)
_VENDOR_LINE = re.compile(
    r"(?:sold by|vendor|supplier|from|billed by|pay to)\s*[:\s]+(.+)",
    re.I,
)


def _flatten_amounts(text: str) -> list[float]:
    out: list[float] = []
    for m in _AMOUNTS.finditer(text):
        g = m.group(1) or m.group(2) or ""
        g = g.replace(",", "").strip()
        if not g:
            continue
        try:
            v = float(g)
            if 1 <= v <= 1_000_000_000:
                out.append(v)
        except ValueError:
            continue
    return out


def _infer_business_type(text: str) -> tuple[str, float]:
    t = text.lower()
    scores: dict[str, int] = {k: 0 for k in _BUSINESS_SCORES}
    for cat, kws in _BUSINESS_SCORES.items():
        for kw in kws:
            if kw in t:
                scores[cat] += len(kw)
    best = max(scores.values())
    if best == 0:
        if "gst" in t or "tax invoice" in t or "invoice" in t:
            return "general_merchant", 0.35
        return "unknown", 0.2
    label = max(scores, key=lambda k: scores[k])
    conf = min(0.95, 0.35 + 0.08 * best)
    return label, conf


def _vendor_tokens(text: str) -> list[str]:
    lines = [ln.strip() for ln in text.splitlines() if len(ln.strip()) > 8]
    vendors: list[str] = []
    for ln in lines:
        m = _VENDOR_LINE.search(ln)
        if m:
            vendors.append(m.group(1).strip()[:80])
        elif any(x in ln.lower() for x in ("pvt", "llp", "limited", "ltd", "proprietor")):
            vendors.append(ln[:80])
    return vendors


def _cash_digital_ratio(text: str) -> float:
    t = text.lower()
    upi = len(re.findall(r"\bupi\b|@okaxis|@paytm|@ybl|phonepe|gpay", t))
    cash = len(re.findall(r"\bcash\b|cod\b|counter", t))
    card = len(re.findall(r"\bcard\b|pos\b|swipe", t))
    tot = upi + cash + card + 1e-6
    # digital = UPI + card; cash mentions reduce digital share
    digital_w = upi + card
    raw = digital_w / (digital_w + cash + 0.5)
    return float(max(0.1, min(0.95, raw)))


def _frequency_signal(text: str) -> str:
    dates = len(_DATE_HINTS.findall(text))
    inv = len(re.findall(r"\binv(?:oice)?\.?\s*#?\s*[\w/-]+", text, re.I))
    score = dates + inv
    if score >= 12:
        return "high"
    if score >= 4:
        return "medium"
    return "low"


def analyze_texts(texts: list[str]) -> dict[str, Any]:
    """
    Aggregate OCR text from multiple documents into one business profile.
    """
    combined = "\n\n---DOC---\n\n".join(t.strip() for t in texts if t and str(t).strip())
    if not combined.strip():
        return {
            "business_type": "unknown",
            "business_type_confidence": 0.0,
            "avg_ticket_size": None,
            "vendor_count": 0,
            "cash_ratio_estimate": 0.5,
            "transaction_frequency": "low",
            "seasonality_hint": "unknown",
            "confidence": 0.15,
            "amount_samples": 0,
        }

    amounts = _flatten_amounts(combined)
    bt, bt_conf = _infer_business_type(combined)
    vendors = _vendor_tokens(combined)
    vendor_unique = len(set(v.lower()[:40] for v in vendors)) if vendors else 0
    # Repeated tokens that look like names
    words = re.findall(r"[A-Za-z][A-Za-z\s&]{4,40}", combined)
    common = [w for w, c in Counter(w.strip().lower() for w in words).items() if c >= 2 and len(w) > 5]
    vendor_est = max(vendor_unique, min(len(common), 25))

    avg_ticket = None
    if amounts:
        s = sorted(amounts)
        # Median of "plausible" line amounts only – bare digits in OCR often include
        # GST %, page numbers, or fragments that pull the median down to ₹1–₹10.
        plausible = [a for a in s if a >= 25.0]
        basis = plausible if plausible else s
        mid = basis[len(basis) // 2]
        # Median = typical transaction size (not arithmetic mean); field name kept for API compat.
        avg_ticket = round(mid, 2)

    dig = _cash_digital_ratio(combined)
    cash_r = round(1.0 - dig, 3)
    freq = _frequency_signal(combined)

    # Seasonality: weekend / festival mentions
    season = "unknown"
    tl = combined.lower()
    if any(x in tl for x in ("diwali", "dussehra", "holi", "eid", "christmas", "new year")):
        season = "festival_mentions"
    elif any(x in tl for x in ("weekend", "saturday", "sunday")):
        season = "weekend_bias"

    # Overall confidence: data richness
    conf = 0.25
    if amounts:
        conf += min(0.35, 0.02 * min(len(amounts), 40))
    conf += 0.1 * min(bt_conf, 1.0)
    if len(combined) > 500:
        conf += 0.1
    conf = float(min(0.92, conf))

    return {
        "business_type": bt,
        "business_type_confidence": round(bt_conf, 3),
        "avg_ticket_size": avg_ticket,
        "median_amount_inr": avg_ticket,
        "amount_samples": len(amounts),
        "vendor_count": int(vendor_est),
        "cash_ratio_estimate": cash_r,
        "digital_ratio_estimate": round(dig, 3),
        "transaction_frequency": freq,
        "seasonality_hint": season,
        "confidence": round(conf, 3),
        "supplier_structure": "diverse" if vendor_est > 8 else "concentrated" if vendor_est <= 3 else "moderate",
    }


def _merge_onboarding_and_snapshot(user_id: int | None, profile: dict[str, Any]) -> None:
    from models.business_profile_engine import (
        compute_business_vector,
        compute_formality_score,
        compute_trust_score,
    )
    from services import ingestion_service, state_store
    from services.module_selector import infer_profile_type_label, select_modules

    ob = dict(state_store.get_onboarding(user_id) or {})
    bt = str(profile.get("business_type") or "unknown")
    if bt != "unknown":
        ob["business_type"] = bt[:200]

    cr = profile.get("cash_ratio_estimate")
    if cr is not None and 0 <= cr <= 1:
        ob["payment_mix"] = {"cash": float(cr), "digital": float(1.0 - float(cr))}

    ob["has_invoices"] = True

    # Ensure minimal schema for vector math
    ob.setdefault("revenue_model", ob.get("revenue_model") or "hybrid")
    ob.setdefault("monthly_turnover_range", ob.get("monthly_turnover_range") or "5-25L")
    ob.setdefault("num_employees", int(ob.get("num_employees") or 2))
    ob.setdefault("inventory_type", ob.get("inventory_type") or "low")
    ob.setdefault("credit_usage", ob.get("credit_usage") or "informal")
    ob.setdefault("gst_registered", bool(ob.get("gst_registered", True)))

    state_store.set_onboarding(ob, user_id=user_id)

    f = compute_formality_score(ob)
    t = compute_trust_score(ob, ingestion_service.get_source_mix() or {})
    vec = compute_business_vector(ob, None, f)
    modules = select_modules(vec, ob)
    ptype = infer_profile_type_label(ob, vec)

    snap = {
        "formality_score": f,
        "trust_score": t,
        "business_vector": vec,
        "active_modules": modules,
        "profile_type": ptype,
        "document_intelligence": profile,
    }
    state_store.set_business_profile_snapshot(snap, user_id=user_id)


def apply_document_profile_to_user(user_id: int, profile: dict[str, Any]) -> None:
    """Persist profile, merge into user + global onboarding so the system engine sees context."""
    from services import state_store

    state_store.set_document_profile(user_id, profile)
    state_store.set_document_profile(None, profile)
    _merge_onboarding_and_snapshot(user_id, profile)
    _merge_onboarding_and_snapshot(None, profile)
