"""Nightly-style peer benchmarks – anonymized p50/p90 by industry (business_type)."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone

from db.prisma_client import prisma


async def refresh_benchmark_aggregates() -> dict[str, int]:
    """Recompute aggregates from persisted ledger + business profiles."""
    profiles = await prisma.businessprofile.find_many()
    since = datetime.now(timezone.utc) - timedelta(days=30)
    buckets: dict[str, list[float]] = defaultdict(list)
    for p in profiles:
        txs = await prisma.ledgertransaction.find_many(
            where={
                "user_id": p.user_id,
                "occurred_at": {"gte": since},
                "txn_type": "credit",
            },
        )
        total = sum(float(t.amount) for t in txs)
        key = (p.business_type or "unknown").strip() or "unknown"
        buckets[key].append(total)

    upserts = 0
    for industry, vals in buckets.items():
        if len(vals) < 1:
            continue
        vals_sorted = sorted(vals)
        n = len(vals_sorted)
        p50 = vals_sorted[n // 2]
        # Single business: p90 = p50 so solo demos still get a benchmark row after refresh.
        p90 = vals_sorted[min(n - 1, int(n * 0.9))] if n > 1 else vals_sorted[0]
        await prisma.benchmarkaggregate.upsert(
            where={
                "industry_key_metric": {
                    "industry_key": industry,
                    "metric": "credit_volume_30d_inr",
                }
            },
            data={
                "create": {
                    "industry_key": industry,
                    "metric": "credit_volume_30d_inr",
                    "p50": p50,
                    "p90": p90,
                    "sample_count": n,
                },
                "update": {
                    "p50": p50,
                    "p90": p90,
                    "sample_count": n,
                },
            },
        )
        upserts += 1
    return {"industries_updated": upserts}


async def benchmarks_for_industry(industry_key: str | None) -> list[dict[str, object]]:
    if not industry_key:
        return []
    rows = await prisma.benchmarkaggregate.find_many(
        where={"industry_key": industry_key},
    )
    return [
        {
            "industry_key": r.industry_key,
            "metric": r.metric,
            "p50": r.p50,
            "p90": r.p90,
            "sample_count": r.sample_count,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in rows
    ]
