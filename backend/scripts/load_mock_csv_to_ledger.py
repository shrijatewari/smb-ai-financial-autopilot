#!/usr/bin/env python3
"""
Insert rows from data/mock_transactions.csv into PostgreSQL LedgerTransaction for the demo user.

Use when the Transactions page shows "No transactions in your database yet" but you prefer
CSV over the full seed (or after clearing the ledger).

Run from repo:  cd backend && python scripts/load_mock_csv_to_ledger.py

Requires: DATABASE_URL in backend/.env, demo user (run scripts/seed_mock_data.py once to create demo@example.com).

Optional: MOCK_CSV_PATH=/path/to/file.csv
"""

from __future__ import annotations

import asyncio
import csv
import os
import sys
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

_BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACKEND))

from dotenv import load_dotenv

load_dotenv(_BACKEND / ".env")

from db.prisma_client import prisma

DEMO_EMAIL = "demo@example.com"
DEFAULT_CSV = _BACKEND / "data" / "mock_transactions.csv"


def _infer_category(description: str, txn_type: str) -> str:
    d = description.lower()
    if txn_type == "credit":
        if any(x in d for x in ("imps", "capital", "top-up")):
            return "transfer"
        return "revenue"
    if "rent" in d:
        return "rent"
    if "salary" in d or "staff" in d or "helper" in d:
        return "salary"
    if any(x in d for x in ("supplier", "distributor", "freight", "fmcg")):
        return "supplier"
    if "electric" in d or "bescom" in d:
        return "utilities"
    if "gst" in d or "challan" in d:
        return "tax"
    if any(x in d for x in ("lpg", "stock", "cold drink", "marketing", "equipment")):
        return "inventory"
    if "insurance" in d or "bank charge" in d or "fee" in d:
        return "fees"
    if "petty" in d or "snack" in d:
        return "personal"
    return "expense"


def _rows_from_csv(path: Path) -> list[dict]:
    out: list[dict] = []
    with path.open(encoding="utf-8", newline="") as f:
        r = csv.DictReader(f)
        for i, row in enumerate(r):
            date_s = (row.get("date") or "").strip()
            typ = (row.get("type") or "").strip().lower()
            desc = (row.get("description") or "").strip()
            amt_raw = row.get("amount")
            if not date_s or typ not in ("credit", "debit") or amt_raw is None:
                continue
            try:
                amt = Decimal(str(amt_raw).strip())
            except Exception:
                continue
            if amt <= 0:
                continue
            try:
                d = datetime.strptime(date_s[:10], "%Y-%m-%d").replace(
                    hour=12, minute=0, second=0, tzinfo=timezone.utc
                )
            except ValueError:
                continue
            cat = _infer_category(desc, typ)[:32]
            conf = Decimal(f"{0.62 + (i % 17) * 0.018:.4f}")
            out.append(
                {
                    "amount": amt,
                    "txn_type": typ,
                    "category": cat,
                    "source": "csv_upload",
                    "occurred_at": d,
                    "confidence_score": conf,
                    "description": desc[:2000] if desc else None,
                }
            )
    return out


async def main() -> None:
    path = Path(os.environ.get("MOCK_CSV_PATH", str(DEFAULT_CSV))).resolve()
    if not path.is_file():
        print(f"CSV not found: {path}", file=sys.stderr)
        sys.exit(1)

    ledger_rows = _rows_from_csv(path)
    if not ledger_rows:
        print("No valid rows in CSV.", file=sys.stderr)
        sys.exit(1)

    await prisma.connect()
    try:
        user = await prisma.user.find_unique(where={"email": DEMO_EMAIL})
        if not user:
            print(
                f"User {DEMO_EMAIL} not found. Run: python scripts/seed_mock_data.py",
                file=sys.stderr,
            )
            sys.exit(1)

        uid = user.id
        await prisma.ledgertransaction.delete_many(where={"user_id": uid})
        await prisma.ledgertransaction.create_many(
            data=[{**r, "user_id": uid} for r in ledger_rows]
        )
        print(f"Loaded {len(ledger_rows)} ledger rows from {path.name} for {DEMO_EMAIL} (user_id={uid}).")
    finally:
        await prisma.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
