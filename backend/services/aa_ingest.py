"""Persist Account Aggregator normalized rows to the user's ledger."""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from decimal import Decimal

from prisma.fields import Json

from db.prisma_client import prisma

logger = logging.getLogger(__name__)


async def ingest_aa_transactions_for_user(user_id: int, rows: list[dict]) -> int:
    """Insert LedgerTransaction rows; skip duplicates by aa_txn_id in metadata when present."""
    if not rows:
        return 0
    existing = await prisma.ledgertransaction.find_many(
        where={"user_id": user_id, "source": "account_aggregator"},
    )
    seen: set[str] = set()
    for r in existing:
        meta = r.metadata if isinstance(r.metadata, dict) else {}
        tid = meta.get("aa_txn_id")
        if tid:
            seen.add(str(tid))

    n = 0
    for row in rows:
        tid = str(row.get("txn_id") or "")
        if tid and tid in seen:
            continue
        ds = row.get("date") or ""
        try:
            if ds:
                occurred = datetime.strptime(ds[:10], "%Y-%m-%d")
            else:
                occurred = datetime.combine(date.today(), datetime.min.time())
        except ValueError:
            occurred = datetime.now(timezone.utc).replace(tzinfo=None)
        amt = Decimal(str(row.get("amount") or 0))
        if amt <= 0:
            continue
        ttype = str(row.get("type") or "debit").lower()
        if ttype not in ("credit", "debit"):
            ttype = "debit"
        desc = str(row.get("description") or "AA transaction")[:2000]
        meta: dict = {}
        if tid:
            meta["aa_txn_id"] = tid
        await prisma.ledgertransaction.create(
            data={
                "user_id": user_id,
                "amount": amt,
                "txn_type": ttype,
                "category": "bank_aa",
                "source": "account_aggregator",
                "description": desc,
                "occurred_at": occurred,
                "metadata": Json(meta) if meta else Json({}),
                "confidence_score": Decimal("0.95"),
            }
        )
        if tid:
            seen.add(tid)
        n += 1
    logger.info("AA ingest: %s new rows for user %s", n, user_id)
    return n
