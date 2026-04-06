#!/usr/bin/env python3
"""
Insert demo rows into PostgreSQL (Prisma models) for local testing.
Run from repo:  cd backend && python scripts/seed_mock_data.py

Login after seed:
  email:    demo@example.com
  password: DemoPass123!

Growth / collections data is per user_id. If the UI calls a remote API (e.g. Fly),
DATABASE_URL in backend/.env must point at THAT Postgres when you seed — otherwise
you only populate local DB while the app reads an empty production DB. Use the same
demo login on the environment that was seeded.
"""

from __future__ import annotations

import asyncio
import os
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
                            "business_type": "Retail (products) — Kirana",
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
                            "business_type": "Retail (products) — Kirana",
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

        await prisma.ledgertransaction.create_many(
            data=[
                {
                    "user_id": uid,
                    "amount": Decimal("12500.00"),
                    "txn_type": "credit",
                    "category": "revenue",
                    "source": "sms",
                    "occurred_at": now - timedelta(days=1),
                    "confidence_score": Decimal("0.88"),
                    "description": "UPI received from CUSTOMER",
                },
                {
                    "user_id": uid,
                    "amount": Decimal("8800.00"),
                    "txn_type": "credit",
                    "category": "revenue",
                    "source": "sms",
                    "occurred_at": now - timedelta(days=5),
                    "confidence_score": Decimal("0.85"),
                    "description": "UPI received — walk-in",
                },
                {
                    "user_id": uid,
                    "amount": Decimal("4200.00"),
                    "txn_type": "debit",
                    "category": "supplier",
                    "source": "manual",
                    "occurred_at": now - timedelta(hours=8),
                    "confidence_score": Decimal("0.95"),
                    "description": "Supplier payment — grains",
                },
                {
                    "user_id": uid,
                    "amount": Decimal("3100.00"),
                    "txn_type": "debit",
                    "category": "supplier",
                    "source": "manual",
                    "occurred_at": now - timedelta(days=2),
                    "confidence_score": Decimal("0.91"),
                    "description": "Supplier — oil stock",
                },
                {
                    "user_id": uid,
                    "amount": Decimal("500.00"),
                    "txn_type": "debit",
                    "category": "personal",
                    "source": "sms",
                    "occurred_at": now - timedelta(hours=2),
                    "confidence_score": Decimal("0.72"),
                    "description": "ATM withdrawal",
                },
            ]
        )

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
        print(f"  Customers: 5 | Benchmark aggregates refreshed: {bm}")
        print("  Open UI: http://localhost:5173  |  API: http://127.0.0.1:8000/docs")
        print(
            "  Remote API: seed must use the SAME database as the API (set DATABASE_URL in backend/.env). "
            "Then log in as demo@example.com — a different account has no seeded rows."
        )
    finally:
        await prisma.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
