"""
GST liability forecasting – return history (mock / future GSP), next filing estimate, Monte Carlo hooks.

Live Government GST portal integration can replace mock data; env `GST_GSP_ENABLED` reserved for future use.
"""

from __future__ import annotations

import calendar
import os
import re
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from prisma.fields import Json

from db.prisma_client import prisma

_GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z0-9]{13}$")


def _normalize_gstin(raw: str | None) -> str | None:
    if not raw:
        return None
    s = str(raw).strip().upper().replace(" ", "")
    if len(s) == 15 and _GSTIN_RE.match(s):
        return s
    return None


def _add_months(d: date, months: int) -> date:
    m = d.month - 1 + months
    y = d.year + m // 12
    m = m % 12 + 1
    day = min(d.day, calendar.monthrange(y, m)[1])
    return date(y, m, day)


def _default_gstr3b_due_after_month(period_end: date) -> date:
    """Monthly GSTR-3B due ~20th of month following the tax period (simplified)."""
    next_m = _add_months(period_end.replace(day=1), 1)
    last = calendar.monthrange(next_m.year, next_m.month)[1]
    return date(next_m.year, next_m.month, min(20, last))


async def fetch_gst_returns(gstin: str, user_id: int) -> list[dict[str, Any]]:
    """
    Fetch GST return history for a GSTIN. Without a live GSP, backfills plausible GSTR-3B rows into `GSTRecord`.
    """
    g = _normalize_gstin(gstin)
    if not g:
        return []

    existing = await prisma.gstrecord.find_many(
        where={"user_id": user_id, "gstin": g},
        order={"period": "desc"},
        take=24,
    )
    if existing:
        return [
            {
                "period": r.period,
                "return_type": r.return_type,
                "filed_at": r.filed_at.isoformat() if r.filed_at else None,
                "taxable_value": float(r.taxable_value) if r.taxable_value is not None else None,
                "tax_paid": float(r.tax_paid) if r.tax_paid is not None else None,
            }
            for r in existing
        ]

    if os.getenv("GST_GSP_ENABLED", "").strip().lower() in ("1", "true", "yes"):
        # Placeholder for real GSP HTTP client
        pass

    # Mock: last 3 monthly periods
    out: list[dict[str, Any]] = []
    today = date.today()
    for i in range(3, 0, -1):
        pe = _add_months(today.replace(day=1), -i)
        last_d = calendar.monthrange(pe.year, pe.month)[1]
        period_end = date(pe.year, pe.month, last_d)
        period_label = f"{pe.year}-{pe.month:02d}"
        taxable = Decimal("250000.00") + Decimal(i * 15000)
        tax_paid = (taxable * Decimal("0.18") * Decimal("0.6")).quantize(Decimal("0.01"))
        filed = _default_gstr3b_due_after_month(period_end)
        await prisma.gstrecord.create(
            data={
                "user_id": user_id,
                "gstin": g,
                "period": period_label,
                "return_type": "GSTR3B",
                "filed_at": filed,
                "taxable_value": taxable,
                "tax_paid": tax_paid,
                "raw": Json({"mock": True, "source": "fetch_gst_returns"}),
            }
        )
        out.append(
            {
                "period": period_label,
                "return_type": "GSTR3B",
                "filed_at": filed.isoformat(),
                "taxable_value": float(taxable),
                "tax_paid": float(tax_paid),
            }
        )
    return out


def _turnover_monthly_from_onboarding(ob: dict[str, Any]) -> float:
    t = str(ob.get("monthly_turnover_range", "")).lower()
    if t in ("under_50k", "under-50k"):
        return 35_000.0
    if t in ("50k_to_5l", "50k-5l"):
        return 250_000.0
    if t in ("5l_to_50l", "5l-50l"):
        return 2_500_000.0
    if t in ("50l_plus", "50l+"):
        return 8_000_000.0
    return 500_000.0


async def estimate_next_liability(user_id: int) -> dict[str, Any]:
    """
    Estimate next GSTR-3B liability and due date from profile + recent `GSTRecord` / ledger signals.
    """
    bp = await prisma.businessprofile.find_unique(where={"user_id": user_id})
    registered = bool(bp and bp.gst_registered)
    gstin = _normalize_gstin(getattr(bp, "gstin", None) if bp else None)

    monthly = _turnover_monthly_from_onboarding(
        {"monthly_turnover_range": str(getattr(bp, "monthly_turnover_range", "") or "")}
    )
    taxable_base = monthly * 0.6
    liability = round(taxable_base * 0.18, 2) if registered else 0.0

    recent = await prisma.gstrecord.find_many(
        where={"user_id": user_id},
        order={"filed_at": "desc"},
        take=1,
    )
    if recent and recent[0].tax_paid is not None:
        lp = float(recent[0].tax_paid)
        if lp > 0:
            liability = round(max(liability * 0.85, lp * 0.95), 2)

    # Next due: 20th of next calendar month (monthly filing simplification)
    today = date.today()
    next_month = _add_months(today.replace(day=1), 1)
    last = calendar.monthrange(next_month.year, next_month.month)[1]
    due = date(next_month.year, next_month.month, min(20, last))
    days_until = (due - today).days

    return {
        "gst_registered": registered,
        "gstin": gstin,
        "estimated_liability_inr": liability if registered else 0.0,
        "due_date": due.isoformat(),
        "days_until_due": days_until,
        "basis": "turnover_and_profile" if not recent else "blended_with_last_filing",
    }


def due_day_index_for_horizon(due: date, horizon_days: int, today: date | None = None) -> int | None:
    """0-based day index within [0, horizon_days) when cash leaves, or None if outside window."""
    t = today or date.today()
    d = (due - t).days
    if d < 0:
        return 0
    if d >= horizon_days:
        return None
    return d


async def resolve_gst_monte_carlo_params(user_id: int, horizon_days: int) -> tuple[float | None, int | None]:
    """Cash outflow amount + simulation day index for `run_monte_carlo` / `run_full_pipeline`."""
    est = await estimate_next_liability(user_id)
    if not est.get("gst_registered"):
        return None, None
    amt = float(est.get("estimated_liability_inr") or 0)
    if amt <= 0:
        return None, None
    due = date.fromisoformat(str(est["due_date"]))
    idx = due_day_index_for_horizon(due, horizon_days)
    if idx is None:
        return None, None
    return amt, idx


async def get_gst_summary_for_user(user_id: int) -> dict[str, Any]:
    """Unified payload for GET /gst/summary and `dashboard_context.gst`."""
    bp = await prisma.businessprofile.find_unique(where={"user_id": user_id})
    registered = bool(bp and bp.gst_registered)
    gstin = _normalize_gstin(getattr(bp, "gstin", None) if bp else None)

    if gstin:
        await fetch_gst_returns(gstin, user_id)

    est = await estimate_next_liability(user_id)
    days = int(est.get("days_until_due") or 0)
    show_warning = bool(registered and 0 <= days <= 14)

    mc_base = await resolve_gst_monte_carlo_params(user_id, 30)
    return {
        "gst_registered": registered,
        "gstin": gstin,
        "next_due_date": est.get("due_date"),
        "days_until_due": days,
        "estimated_liability_inr": float(est.get("estimated_liability_inr") or 0),
        "show_warning": show_warning,
        "basis": est.get("basis"),
        "note": "Estimated GSTR-3B-style liability; /dashboard Monte Carlo subtracts this on the due day when it falls inside the horizon.",
        "monte_carlo_gst_amount": mc_base[0],
        "monte_carlo_gst_day_index": mc_base[1],
    }
