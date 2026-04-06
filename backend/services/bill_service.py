"""Bill ingest – inventory deduction, ledger credit, optional khaata (Customer) link."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from prisma.fields import Json

from db.prisma_client import prisma

logger = logging.getLogger(__name__)


def _digits10(phone: str | None) -> str | None:
    if not phone:
        return None
    d = "".join(c for c in phone if c.isdigit())
    if len(d) < 10:
        return None
    return d[-10:]


def _sku_from_line_name(name: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9]+", "-", name.strip().lower()).strip("-")[:50]
    return base or "item"


async def _unique_sku(user_id: int, base: str) -> str:
    """SKU unique per user (VARCHAR 64)."""
    sku = base[:64]
    n = 0
    while await prisma.inventoryitem.find_first(where={"user_id": user_id, "sku": sku}):
        n += 1
        suffix = f"-{n}"
        sku = (base[: 64 - len(suffix)] + suffix)[:64]
    return sku


async def process_bill_ingest(
    user_id: int,
    *,
    bill_number: str,
    source: str,
    line_items: list[dict[str, Any]],
    total_amount: float,
    customer_phone: str | None,
    customer_name: str | None,
    raw_payload: dict[str, Any] | None,
    file_path: str | None,
    udhar: bool = False,
    occurred_at: datetime | None = None,
) -> dict[str, Any]:
    """
    Shared core for JSON + OCR ingest.
    Returns dict with status, items_updated, unknown_items, khaata_linked, bill_id.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    when = occurred_at or now
    item_rows: list[dict[str, Any]] = []
    unknown_items: list[str] = []
    items_updated = 0

    inv_items = await prisma.inventoryitem.find_many(where={"user_id": user_id})
    name_index = {i.name.strip().lower(): i for i in inv_items}

    for li in line_items:
        name = str(li.get("name") or "").strip()
        try:
            qty = float(li.get("qty") or 0)
        except (TypeError, ValueError):
            qty = 0.0
        try:
            unit_price = float(li.get("unit_price") or 0)
        except (TypeError, ValueError):
            unit_price = 0.0
        if qty <= 0 or not name:
            continue

        key = name.lower()
        match = name_index.get(key)
        if not match:
            for inv in inv_items:
                inv_l = inv.name.strip().lower()
                if inv_l == key or key in inv_l or inv_l in key:
                    match = inv
                    break

        if match:
            old_q = float(match.quantity)
            new_q = max(0.0, old_q - qty)
            th = float(match.reorder_threshold)
            old_ce = getattr(match, "stock_ceiling", None)
            ceiling = max(float(old_ce) if old_ce is not None else 0.0, old_q, th * 5.0)
            await prisma.inventoryitem.update(
                where={"id": match.id},
                data={"quantity": new_q, "last_bill_deduct_at": now, "stock_ceiling": ceiling},
            )
            items_updated += 1
            item_rows.append(
                {
                    "name": name,
                    "qty": qty,
                    "unit_price": unit_price,
                    "inventory_item_id": match.id,
                    "matched": True,
                    "auto_created": False,
                }
            )
        else:
            # No catalog row: create SKU so the bill always moves inventory (opening stock = units sold).
            sku_base = _sku_from_line_name(name)
            sku = await _unique_sku(user_id, sku_base)
            # Opening stock assumed = units sold → on-hand after sale is 0 (first-time SKU).
            created = await prisma.inventoryitem.create(
                data={
                    "user_id": user_id,
                    "sku": sku,
                    "name": name[:255],
                    "quantity": max(0.0, float(qty) - qty),
                    "last_bill_deduct_at": now,
                    "stock_ceiling": float(qty),
                }
            )
            inv_items.append(created)
            name_index[name.lower()] = created
            items_updated += 1
            item_rows.append(
                {
                    "name": name,
                    "qty": qty,
                    "unit_price": unit_price,
                    "inventory_item_id": created.id,
                    "matched": True,
                    "auto_created": True,
                }
            )

    amt_dec = Decimal(str(max(0.0, float(total_amount))))
    status = "completed" if not unknown_items else "partial"

    bill = await prisma.bill.create(
        data={
            "user_id": user_id,
            "bill_number": (bill_number or "BILL")[:128],
            "source": source[:16],
            "raw_payload": Json(raw_payload if raw_payload is not None else {}),
            "parsed_items": Json({"lines": item_rows, "unknown": unknown_items}),
            "total_amount": amt_dec,
            "customer_phone": customer_phone[:20] if customer_phone else None,
            "customer_name": customer_name[:255] if customer_name else None,
            "file_path": file_path,
            "status": status,
            "error_message": None,
        }
    )

    if amt_dec > 0:
        await prisma.ledgertransaction.create(
            data={
                "user_id": user_id,
                "amount": amt_dec,
                "txn_type": "credit",
                "category": "sale",
                "source": "bill_ingest",
                "description": f"Bill {bill.bill_number} ({source})",
                "occurred_at": when,
                "metadata": Json({"bill_id": bill.id, "bill_number": bill.bill_number}),
                "confidence_score": Decimal("0.9"),
            }
        )

    khaata_linked = False
    phone10 = _digits10(customer_phone)
    if phone10:
        custs = await prisma.customer.find_many(where={"user_id": user_id})
        for c in custs:
            cp = _digits10(c.phone)
            if cp == phone10:
                extra = amt_dec if udhar else Decimal(0)
                new_due = Decimal(str(c.total_due or 0)) + extra
                await prisma.customer.update(
                    where={"id": c.id},
                    data={
                        "bill_id": bill.id,
                        "total_due": new_due,
                    },
                )
                khaata_linked = True
                break

    return {
        "status": status,
        "bill_id": bill.id,
        "items_updated": items_updated,
        "unknown_items": unknown_items,
        "khaata_linked": khaata_linked,
    }


async def bill_to_message_parts(user_id: int, bill_id: int) -> dict[str, Any] | None:
    """Load bill for WhatsApp message formatting."""
    b = await prisma.bill.find_first(where={"id": bill_id, "user_id": user_id})
    if not b:
        return None
    parsed = b.parsed_items if isinstance(b.parsed_items, dict) else {}
    lines = parsed.get("lines") or []
    return {
        "bill_number": b.bill_number,
        "source": b.source,
        "total_amount": float(b.total_amount),
        "created_at": b.created_at.isoformat() if b.created_at else "",
        "parsed_lines": lines,
        "file_path": b.file_path,
        "customer_name": b.customer_name,
    }
