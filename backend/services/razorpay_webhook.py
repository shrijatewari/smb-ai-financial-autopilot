"""
Razorpay payment webhooks – verify HMAC, post ledger credit, reduce customer dues, complete collect actions.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from prisma.fields import Json

from db.prisma_client import prisma
from engine.system_engine import refresh_snapshot

logger = logging.getLogger(__name__)


def verify_razorpay_signature(body_bytes: bytes, signature: str, secret: str) -> bool:
    """HMAC-SHA256 hex digest of raw body (Razorpay webhook verification)."""
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def _digits10(value: str | None) -> str | None:
    if not value:
        return None
    d = "".join(c for c in value if c.isdigit())
    if len(d) >= 10:
        return d[-10:]
    return None


def _parse_notes(raw: Any) -> dict[str, str]:
    if raw is None:
        return {}
    if isinstance(raw, dict):
        return {str(k): str(v) for k, v in raw.items() if v is not None}
    if isinstance(raw, str):
        try:
            obj = json.loads(raw)
            if isinstance(obj, dict):
                return {str(k): str(v) for k, v in obj.items()}
        except json.JSONDecodeError:
            pass
    return {}


def _extract_payment_entity(body: dict[str, Any]) -> dict[str, Any] | None:
    """Razorpay v2: payload.payment.entity."""
    if body.get("event") != "payment.captured":
        return None
    pl = body.get("payload") or {}
    pay = pl.get("payment") or {}
    ent = pay.get("entity")
    if isinstance(ent, dict):
        return ent
    return None


async def _find_customer_for_payment(
    entity: dict[str, Any],
) -> tuple[Any | None, int | None]:
    """
    Resolve (Customer, user_id) via notes.user_id + notes.customer_id, else phone match on last 10 digits.
    """
    notes = _parse_notes(entity.get("notes"))
    uid_raw = notes.get("user_id")
    cid_raw = notes.get("customer_id")
    if uid_raw and cid_raw:
        try:
            uid = int(uid_raw)
            cid = int(cid_raw)
            c = await prisma.customer.find_first(where={"id": cid, "user_id": uid})
            if c:
                return c, uid
        except (ValueError, TypeError):
            pass

    phone10 = _digits10(str(entity.get("contact") or ""))
    if phone10:
        customers = await prisma.customer.find_many()
        for c in customers:
            if c.phone and _digits10(c.phone) == phone10:
                return c, c.user_id

    email = (entity.get("email") or "").strip().lower()
    if email:
        user = await prisma.user.find_unique(where={"email": email})
        if user:
            # Prefer a customer with outstanding balance
            rows = await prisma.customer.find_many(
                where={"user_id": user.id},
                order={"total_due": "desc"},
            )
            if rows:
                return rows[0], user.id

    return None, None


async def _already_processed(payment_id: str, user_id: int) -> bool:
    rows = await prisma.ledgertransaction.find_many(
        where={"user_id": user_id, "source": "razorpay_webhook"},
    )
    for r in rows:
        meta = r.metadata if isinstance(r.metadata, dict) else {}
        if meta.get("payment_id") == payment_id:
            return True
    return False


async def process_payment_captured(body: dict[str, Any]) -> dict[str, Any]:
    entity = _extract_payment_entity(body)
    if not entity:
        return {"handled": False, "reason": "not_payment_captured"}

    payment_id = str(entity.get("id") or "")
    amount_inr = float(entity.get("amount") or 0) / 100.0
    if amount_inr <= 0 or not payment_id:
        return {"handled": False, "reason": "invalid_amount_or_id"}

    customer, user_id = await _find_customer_for_payment(entity)
    if not customer or user_id is None:
        logger.warning("Razorpay webhook: no customer match for payment %s", payment_id)
        return {"handled": False, "reason": "no_matching_customer"}

    if await _already_processed(payment_id, user_id):
        return {"handled": True, "reason": "duplicate", "payment_id": payment_id}

    now = datetime.now(timezone.utc)
    new_due = max(Decimal("0"), Decimal(str(customer.total_due)) - Decimal(str(round(amount_inr, 2))))

    await prisma.customer.update(
        where={"id": customer.id},
        data={
            "total_due": new_due,
            "last_payment_date": now,
        },
    )

    await prisma.ledgertransaction.create(
        data={
            "user_id": user_id,
            "amount": Decimal(str(round(amount_inr, 2))),
            "txn_type": "credit",
            "category": "collection",
            "source": "razorpay_webhook",
            "description": f"Razorpay payment {payment_id}",
            "metadata": Json(
                {
                    "payment_id": payment_id,
                    "customer_id": customer.id,
                    "provider": "razorpay",
                }
            ),
            "occurred_at": now,
            "confidence_score": Decimal("1.0"),
        },
    )

    # Complete open collect_payment actions for this customer (name match)
    short = customer.name.split("(")[0].strip().lower()
    acts = await prisma.systemaction.find_many(
        where={
            "user_id": user_id,
            "action_type": "collect_payment",
            "status": "pending",
        },
    )
    for act in acts:
        tgt = (act.target or "").strip().lower()
        if not tgt:
            continue
        if short in tgt or tgt in short or short[:4] in tgt:
            await prisma.systemaction.update(
                where={"id": act.id},
                data={"status": "completed", "completed_at": now},
            )
            break

    refresh_snapshot()

    return {
        "handled": True,
        "payment_id": payment_id,
        "customer_id": customer.id,
        "amount_inr": round(amount_inr, 2),
    }
