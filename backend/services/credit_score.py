"""
SMB credit signal (0–1000) – composite from ledger velocity, GST compliance, receivables,
and RL engagement. Persisted as CreditScoreSnapshot for lender-facing exports.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from db.prisma_client import prisma
from prisma.fields import Json


def score_band(score: int) -> str:
    """Map 0–1000 raw score to lender-style letter band."""
    if score >= 800:
        return "A"
    if score >= 650:
        return "B"
    if score >= 500:
        return "C"
    return "D"


async def compute_and_persist_credit_score(user_id: int) -> dict[str, Any]:
    since = datetime.now(timezone.utc) - timedelta(days=90)
    tx_count = await prisma.ledgertransaction.count(
        where={"user_id": user_id, "occurred_at": {"gte": since}}
    )
    gst_count = await prisma.gstrecord.count(where={"user_id": user_id})
    customers = await prisma.customer.find_many(where={"user_id": user_id})
    preds = await prisma.prediction.find_many(
        where={"user_id": user_id},
        order={"created_at": "desc"},
        take=1,
    )
    rl_rows = await prisma.rlstate.find_many(
        where={"user_id": user_id},
        order={"created_at": "desc"},
        take=50,
    )

    # Ledger activity (0–300)
    activity = min(300, int(tx_count * 3))

    # GST filing signal (0–250)
    gst_pts = min(250, gst_count * 80)

    # Receivable quality (0–250)
    risk_vals: list[float] = []
    for c in customers:
        rs = getattr(c, "risk_score", None)
        if rs is not None:
            try:
                risk_vals.append(float(rs))
            except (TypeError, ValueError):
                pass
    avg_risk = sum(risk_vals) / len(risk_vals) if risk_vals else 0.0
    receivable_pts = int(max(0, 250 - avg_risk * 400))

    # Model risk / prediction (0–200)
    risk_p = 0.0
    if preds:
        rp = getattr(preds[0], "risk_probability", None)
        if rp is not None:
            try:
                risk_p = float(rp)
            except (TypeError, ValueError):
                pass
    model_pts = int(max(0, 200 - risk_p * 200))

    # RL engagement (0–100)
    rl_reward = 0.0
    for row in rl_rows:
        rw = getattr(row, "reward", None)
        if rw is not None:
            try:
                rl_reward += float(rw)
            except (TypeError, ValueError):
                pass
    rl_pts = min(100, max(0, 50 + int(rl_reward * 10)))

    raw = activity + gst_pts + receivable_pts + model_pts + rl_pts
    score = max(0, min(1000, raw))
    band = score_band(score)

    factors: dict[str, Any] = {
        "ledger_tx_90d": tx_count,
        "gst_filings": gst_count,
        "customers": len(customers),
        "avg_customer_risk": round(avg_risk, 4),
        "prediction_risk_p": round(risk_p, 4),
        "rl_reward_sum": round(rl_reward, 4),
        "weights": {
            "activity": activity,
            "gst": gst_pts,
            "receivable": receivable_pts,
            "model": model_pts,
            "rl": rl_pts,
        },
    }

    await prisma.creditscoresnapshot.create(
        data={
            "user_id": user_id,
            "score": score,
            "band": band,
            "factors": Json(factors),
        }
    )

    return {
        "score": score,
        "band": band,
        "factors": factors,
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }


async def latest_credit_score(user_id: int) -> dict[str, Any] | None:
    row = await prisma.creditscoresnapshot.find_first(
        where={"user_id": user_id},
        order={"created_at": "desc"},
    )
    if row is None:
        return None
    return {
        "score": row.score,
        "band": row.band,
        "factors": row.factors,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
