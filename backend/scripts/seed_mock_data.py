#!/usr/bin/env python3
"""
Insert demo rows into PostgreSQL (Prisma models) for local testing.
Run from repo:  cd backend && python scripts/seed_mock_data.py

Login after seed:
  email:    demo@example.com
  password: DemoPass123!

Mock CSV (same shape as POST /transactions/upload strict format):
  backend/data/mock_transactions.csv  (~110 rows, Oct 2025–Mar 2026)
  backend/data/sample_transactions.csv – copy used as default session ledger when no upload

Load only ledger from CSV into Postgres (replaces demo user’s saved transactions):
  python scripts/load_mock_csv_to_ledger.py

Growth / collections data is per user_id. If the UI calls a remote API (e.g. Fly),
DATABASE_URL in backend/.env must point at THAT Postgres when you seed – otherwise
you only populate local DB while the app reads an empty production DB. Use the same
demo login on the environment that was seeded.
"""

from __future__ import annotations

import asyncio
import os
import random
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

# backend/ on sys.path
_BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACKEND))

from dotenv import load_dotenv

load_dotenv(_BACKEND / ".env")

from auth.password import hash_password
from db.prisma_client import prisma
from prisma.fields import Json
from services.benchmark_service import refresh_benchmark_aggregates


DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "DemoPass123!"


def _build_demo_ledger_rows(user_id: int, now: datetime) -> list[dict]:
    """
    Rich demo ledger: credits + debits, many sources/categories, ~90-day spread.
    Keeps category/source under 32 chars (Prisma VarChar).
    """
    rng = random.Random(20260331)
    rows: list[dict] = []

    def add(
        days_ago: float,
        amount: str,
        txn_type: str,
        category: str,
        source: str,
        description: str,
        confidence: str,
    ) -> None:
        rows.append(
            {
                "user_id": user_id,
                "amount": Decimal(amount),
                "txn_type": txn_type,
                "category": category,
                "source": source,
                "occurred_at": now - timedelta(days=days_ago, hours=rng.randint(0, 20)),
                "confidence_score": Decimal(confidence),
                "description": description,
            }
        )

    # --- Anchors (same story as before, slightly retimed) ---
    add(1, "12500.00", "credit", "revenue", "sms", "UPI received from CUSTOMER", "0.8800")
    add(5, "8800.00", "credit", "revenue", "sms", "UPI received – walk-in", "0.8500")
    add(0.33, "4200.00", "debit", "supplier", "manual", "Supplier payment – grains", "0.9500")
    add(2, "3100.00", "debit", "supplier", "manual", "Supplier – oil stock", "0.9100")
    add(0.08, "500.00", "debit", "personal", "sms", "ATM withdrawal", "0.7200")

    # --- More recent week (dense activity) ---
    for spec in [
        (0.2, "3400.00", "credit", "revenue", "paytm", "Paytm QR settlement – counter", "0.9100"),
        (0.4, "2100.00", "credit", "revenue", "razorpay_webhook", "Razorpay payment captured", "0.9600"),
        (0.5, "6750.00", "debit", "supplier", "bank_upload", "NEFT to distributor – FMCG", "0.9300"),
        (0.6, "1200.00", "debit", "utilities", "sms", "Electricity bill – auto debit", "0.8800"),
        (0.7, "450.00", "debit", "fees", "manual", "Bank SMS charges", "0.8200"),
        (0.9, "980.00", "credit", "revenue", "sms", "UPI – morning sales", "0.8600"),
    ]:
        d, amt, tt, cat, src, desc, conf = spec
        add(d, amt, tt, cat, src, desc, conf)

    # --- Spread over last ~90 days: recurring + one-offs ---
    templates: list[tuple[str, str, str, str]] = [
        ("credit", "revenue", "sms", "UPI sale – afternoon rush"),
        ("credit", "revenue", "paytm", "Paytm settlement batch"),
        ("credit", "revenue", "razorpay_webhook", "Online order payment"),
        ("credit", "transfer", "bank_upload", "IMPS in – family float"),
        ("debit", "supplier", "csv_upload", "Wholesale invoice – rice"),
        ("debit", "supplier", "manual", "Cash to delivery van"),
        ("debit", "inventory", "manual", "Cold drink stock – summer"),
        ("debit", "rent", "bank_upload", "Shop rent – monthly"),
        ("debit", "salary", "bank_upload", "Staff salary – helper"),
        ("debit", "utilities", "sms", "Broadband – annual"),
        ("debit", "tax", "manual", "GST payment – challan"),
        ("debit", "fees", "sms", "UPI merchant fee reversal"),
        ("debit", "personal", "sms", "Petty cash – tea/snacks"),
        ("credit", "revenue", "sms", "UPI – kirana walk-in"),
        ("debit", "supplier", "paytm", "Supplier advance via Paytm"),
    ]

    day = 3
    while day < 100:
        amt_base = rng.choice([450, 900, 1200, 1850, 2400, 3200, 4100, 5500, 7200, 8800])
        jitter = rng.randint(-120, 380)
        txn_type, category, source, desc = rng.choice(templates)
        amt = max(120, amt_base + jitter)
        amt_s = f"{amt}.00"
        conf = f"{0.55 + rng.random() * 0.42:.4f}"
        add(
            float(day),
            amt_s,
            txn_type,
            category,
            source,
            f"{desc} (day -{day})",
            conf,
        )
        day += rng.choice([2, 3, 4, 5])

    # --- Extra edge cases (mixed confidence, small amounts) ---
    extras = [
        (12, "75.00", "debit", "fees", "sms", "SMS pack recharge", "0.6100"),
        (18, "199.00", "debit", "personal", "manual", "Stationery – notebooks", "0.7800"),
        (25, "15000.00", "credit", "revenue", "razorpay_webhook", "Large B2B prepayment", "0.9400"),
        (33, "890.00", "debit", "utilities", "manual", "LPG cylinder refill", "0.8300"),
        (41, "220.00", "credit", "revenue", "sms", "UPI – small sale", "0.7000"),
        (55, "12500.00", "debit", "supplier", "bank_upload", "Stock order – festival load", "0.9200"),
        (62, "4500.00", "credit", "transfer", "bank_upload", "Loan disbursement – OD limit", "0.8800"),
        (71, "320.00", "debit", "fees", "sms", "UPI annual maintenance", "0.6600"),
    ]
    for day, amt, tt, cat, src, desc, conf in extras:
        add(float(day), amt, tt, cat, src, desc, conf)

    # Sort by time descending not required for DB; API sorts. Stable row count message:
    return rows


async def main() -> None:
    await prisma.connect()
    try:
        pw = hash_password(DEMO_PASSWORD)
        user = await prisma.user.upsert(
            where={"email": DEMO_EMAIL},
            data={
                "create": {
                    "name": "Demo Kirana Owner",
                    "email": DEMO_EMAIL,
                    "password_hash": pw,
                },
                "update": {"name": "Demo Kirana Owner", "password_hash": pw},
            },
        )
        uid = user.id

        await prisma.onboardingprofile.upsert(
            where={"user_id": uid},
            data={
                "create": {
                    "user_id": uid,
                    "payload": Json(
                        {
                            "business_type": "Retail (products) – Kirana",
                            "revenue_model": "product",
                            "monthly_turnover_range": "50k_to_5L",
                            "num_employees": 4,
                            "inventory_type": "high",
                            "credit_usage": "informal",
                            "payment_mix": {"cash": 0.55, "digital": 0.45},
                            "gst_registered": True,
                            "has_bank_data": True,
                            "has_invoices": False,
                            "customer_type": "repeat",
                            "data_sources": ["sms", "paytm"],
                            "notes": "Seeded mock profile",
                        }
                    ),
                    "snapshot": Json(
                        {
                            "formality_score": 0.62,
                            "trust_score": 0.71,
                            "business_vector": [0.4, 0.35, 0.2, 0.15],
                            "profile_type": "high_inventory_cash_heavy",
                            "active_modules": [
                                {"name": "cash", "priority": 0.95},
                                {"name": "inventory", "priority": 0.82},
                                {"name": "credit", "priority": 0.55},
                            ],
                        }
                    ),
                },
                "update": {
                    "payload": Json(
                        {
                            "business_type": "Retail (products) – Kirana",
                            "revenue_model": "product",
                            "monthly_turnover_range": "50k_to_5L",
                            "num_employees": 4,
                            "inventory_type": "high",
                            "credit_usage": "informal",
                            "payment_mix": {"cash": 0.55, "digital": 0.45},
                            "gst_registered": True,
                            "has_bank_data": True,
                            "has_invoices": False,
                            "customer_type": "repeat",
                            "data_sources": ["sms", "paytm"],
                            "notes": "Seeded mock profile",
                        }
                    ),
                },
            },
        )

        await prisma.businessprofile.upsert(
            where={"user_id": uid},
            data={
                "create": {
                    "user_id": uid,
                    "business_type": "product",
                    "monthly_turnover_range": "50k_to_5L",
                    "payment_mix_cash": Decimal("0.55"),
                    "payment_mix_digital": Decimal("0.45"),
                    "inventory_type": "high",
                    "credit_usage": "informal",
                    "customer_type": "repeat",
                    "gst_registered": True,
                    "gstin": "22AAAAA0000A1Z5",
                    "formality_score": Decimal("0.62"),
                    "trust_score": Decimal("0.71"),
                },
                "update": {
                    "business_type": "product",
                    "monthly_turnover_range": "50k_to_5L",
                    "payment_mix_cash": Decimal("0.55"),
                    "payment_mix_digital": Decimal("0.45"),
                    "inventory_type": "high",
                    "credit_usage": "informal",
                    "customer_type": "repeat",
                    "gst_registered": True,
                    "gstin": "22AAAAA0000A1Z5",
                    "formality_score": Decimal("0.62"),
                    "trust_score": Decimal("0.71"),
                },
            },
        )

        # Clear prior mock children for this user (idempotent re-seed)
        acts = await prisma.systemaction.find_many(where={"user_id": uid})
        for a in acts:
            await prisma.execution.delete_many(where={"action_id": a.id})
        await prisma.systemaction.delete_many(where={"user_id": uid})
        await prisma.ledgertransaction.delete_many(where={"user_id": uid})
        await prisma.reconstructedfinancial.delete_many(where={"user_id": uid})
        await prisma.prediction.delete_many(where={"user_id": uid})
        await prisma.customer.delete_many(where={"user_id": uid})
        await prisma.documentrecord.delete_many(where={"user_id": uid})
        await prisma.rlstate.delete_many(where={"user_id": uid})
        await prisma.inventoryitem.delete_many(where={"user_id": uid})

        now = datetime.now(timezone.utc)
        await prisma.inventoryitem.create_many(
            data=[
                {
                    "user_id": uid,
                    "sku": "RICE-25",
                    "name": "Rice 25kg",
                    "quantity": 42.0,
                    "unit": "bag",
                    "reorder_threshold": 10.0,
                },
                {
                    "user_id": uid,
                    "sku": "OIL-1L",
                    "name": "Sunflower oil 1L",
                    "quantity": 120.0,
                    "unit": "pcs",
                    "reorder_threshold": 24.0,
                },
            ],
        )

        await prisma.customer.create_many(
            data=[
                {
                    "user_id": uid,
                    "name": "Ramesh Wholesale",
                    "phone": "919004930401",
                    "total_due": Decimal("24500.00"),
                    "last_payment_date": now - timedelta(days=12),
                    "risk_score": Decimal("0.18"),
                },
                {
                    "user_id": uid,
                    "name": "Priya Mart",
                    "phone": "919811122233",
                    "total_due": Decimal("8200.50"),
                    "last_payment_date": now - timedelta(days=3),
                    "risk_score": Decimal("0.09"),
                },
                {
                    "user_id": uid,
                    "name": "Suresh Kirana",
                    "phone": "919876543210",
                    "total_due": Decimal("15300.00"),
                    "last_payment_date": now - timedelta(days=20),
                    "risk_score": Decimal("0.22"),
                },
                {
                    "user_id": uid,
                    "name": "Anita Stores",
                    "phone": "919912300045",
                    "total_due": Decimal("6800.00"),
                    "last_payment_date": now - timedelta(days=7),
                    "risk_score": Decimal("0.11"),
                },
                {
                    "user_id": uid,
                    "name": "Vikram Cold Storage",
                    "phone": "919988776655",
                    "total_due": Decimal("42100.75"),
                    "last_payment_date": now - timedelta(days=45),
                    "risk_score": Decimal("0.35"),
                },
            ]
        )

        ledger_data = _build_demo_ledger_rows(uid, now)
        await prisma.ledgertransaction.create_many(data=ledger_data)
        n_ledger = len(ledger_data)

        await prisma.reconstructedfinancial.create(
            data={
                "user_id": uid,
                "observed_revenue": Decimal("118000.00"),
                "estimated_cash": Decimal("62400.00"),
                "total_revenue": Decimal("132000.00"),
                "confidence": Decimal("0.74"),
            }
        )

        await prisma.prediction.create(
            data={
                "user_id": uid,
                "risk_probability": Decimal("0.14"),
                "expected_cash": Decimal("58000.00"),
                "worst_case_cash": Decimal("12000.00"),
                "best_case_cash": Decimal("95000.00"),
                "horizon_days": 30,
            }
        )

        act = await prisma.systemaction.create(
            data={
                "user_id": uid,
                "action_type": "collect_payment",
                "target": "Ramesh Wholesale",
                "amount": Decimal("5000.00"),
                "status": "pending",
                "metadata": Json({"source": "seed"}),
            }
        )
        await prisma.execution.create(
            data={
                "action_id": act.id,
                "channel": "whatsapp",
                "status": "sent",
                "response": "Mock: reminder delivered",
            }
        )

        await prisma.documentrecord.create(
            data={
                "user_id": uid,
                "doc_type": "invoice",
                "file_url": "https://example.com/mock/invoice-001.pdf",
                "parsed_data": Json({"vendor": "ABC Distributors", "amount_inr": 4200}),
                "confidence": Decimal("0.81"),
            }
        )

        await prisma.rlstate.create(
            data={
                "user_id": uid,
                "state": Json({"screen": "dashboard", "module": "cash"}),
                "action": Json({"type": "module_click", "name": "inventory"}),
                "reward": Decimal("0.42"),
                "next_state": Json({"screen": "inventory"}),
            }
        )

        bm = await refresh_benchmark_aggregates()
        print("Seed complete.")
        print(f"  User id: {uid}")
        print(f"  Login:   {DEMO_EMAIL} / {DEMO_PASSWORD}")
        print(f"  Ledger rows: {n_ledger} | Customers: 5 | Benchmark aggregates refreshed: {bm}")
        print("  Open UI: http://localhost:5173  |  API: http://127.0.0.1:8000/docs")
        print(
            "  Remote API: seed must use the SAME database as the API (set DATABASE_URL in backend/.env). "
            "Then log in as demo@example.com – a different account has no seeded rows."
        )
    finally:
        await prisma.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
