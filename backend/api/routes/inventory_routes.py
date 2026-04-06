"""Per-user inventory + khata photo uploads; applying a sale updates stock and appends cash to the ledger."""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from auth.deps import get_current_user
from db.prisma_client import prisma
from prisma.models import User
from services import ingestion_service
from services.khata_vision_service import analyze_khata_file

router = APIRouter()

_KHATA_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "khata"


def _safe_filename(name: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9._-]+", "_", name)[:120]
    return base or "upload.jpg"


class InventoryItemCreate(BaseModel):
    sku: str = Field(..., min_length=1, max_length=64)
    name: str = Field(..., min_length=1, max_length=255)
    quantity: float = Field(0, ge=0, le=1e9)
    unit: str | None = Field(None, max_length=32)
    reorder_threshold: float = Field(20, ge=0, le=100)


class InventoryItemPatch(BaseModel):
    quantity: float | None = Field(None, ge=0, le=1e9)
    reorder_threshold: float | None = Field(None, ge=0, le=100)


class KhataLineIn(BaseModel):
    inventory_item_id: int = Field(..., ge=1)
    quantity: float = Field(..., gt=0, le=1e6)
    amount_inr: float = Field(..., gt=0, le=1e9)


class KhataApplyBody(BaseModel):
    """Record sales from your khata: deduct stock + add cash (credit) to the session ledger."""
    lines: list[KhataLineIn] = Field(..., min_length=1)
    khata_upload_id: int | None = None


@router.get("/items")
async def list_items(user: User = Depends(get_current_user)):
    rows = await prisma.inventoryitem.find_many(where={"user_id": user.id}, order={"name": "asc"})
    return {"items": [_item_out(r) for r in rows]}


@router.post("/items")
async def create_item(body: InventoryItemCreate, user: User = Depends(get_current_user)):
    q = float(body.quantity)
    th = float(body.reorder_threshold)
    sc = max(q, th * 5.0)
    r = await prisma.inventoryitem.create(
        data={
            "user_id": user.id,
            "sku": body.sku.strip(),
            "name": body.name.strip(),
            "quantity": q,
            "unit": body.unit.strip() if body.unit else None,
            "reorder_threshold": th,
            "stock_ceiling": sc,
        }
    )
    return {"item": _item_out(r)}


@router.patch("/items/{item_id}")
async def patch_item(item_id: int, body: InventoryItemPatch, user: User = Depends(get_current_user)):
    existing = await prisma.inventoryitem.find_first(where={"id": item_id, "user_id": user.id})
    if not existing:
        raise HTTPException(status_code=404, detail="Item not found")
    data: dict = {}
    if body.quantity is not None:
        data["quantity"] = float(body.quantity)
    if body.reorder_threshold is not None:
        data["reorder_threshold"] = float(body.reorder_threshold)
    if not data:
        return {"item": _item_out(existing)}
    new_q = float(data.get("quantity", existing.quantity))
    new_th = float(data.get("reorder_threshold", existing.reorder_threshold))
    old_ce = getattr(existing, "stock_ceiling", None)
    data["stock_ceiling"] = max(float(old_ce) if old_ce is not None else 0.0, new_q, new_th * 5.0)
    r = await prisma.inventoryitem.update(where={"id": item_id}, data=data)
    return {"item": _item_out(r)}


@router.post("/khata/upload")
async def upload_khata_photo(
    user: User = Depends(get_current_user),
    file: UploadFile = File(...),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing file")
    raw = await file.read()
    if not raw or len(raw) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File empty or too large (max 8MB)")

    user_dir = _KHATA_DIR / str(user.id)
    user_dir.mkdir(parents=True, exist_ok=True)
    fname = f"{uuid.uuid4().hex}_{_safe_filename(file.filename)}"
    path = user_dir / fname
    path.write_bytes(raw)

    rec = await prisma.khataupload.create(
        data={
            "user_id": user.id,
            "file_path": str(path),
            "original_name": file.filename[:255],
        }
    )

    inv = await prisma.inventoryitem.find_many(where={"user_id": user.id}, order={"name": "asc"})
    vision = analyze_khata_file(path, list(inv))

    n = len(vision.get("suggested_lines") or [])
    msg = "Khata photo saved."
    if vision.get("vision_status") == "ok" and n:
        msg += f" AI ne {n} line(s) suggest ki – neeche check karke Apply dabayein."
    elif vision.get("vision_status") == "skipped_no_api_key":
        msg += " Vision ke liye backend/.env mein OPENAI_API_KEY set karein (auto-read)."
    elif vision.get("vision_status") == "error":
        msg += " Auto-read is baar fail – manually line bharein."
    else:
        msg += " Line manually bharein ya clear photo dubara upload karein."

    return {
        "upload_id": rec.id,
        "original_name": rec.original_name,
        "message": msg,
        "suggested_lines": vision.get("suggested_lines") or [],
        "vision_notes": vision.get("notes") or "",
        "vision_status": vision.get("vision_status") or "unknown",
    }


@router.get("/khata/{upload_id}/image")
async def get_khata_image(upload_id: int, user: User = Depends(get_current_user)):
    rec = await prisma.khataupload.find_first(where={"id": upload_id, "user_id": user.id})
    if not rec:
        raise HTTPException(status_code=404, detail="Upload not found")
    p = Path(rec.file_path)
    if not p.is_file():
        raise HTTPException(status_code=404, detail="File missing on disk")
    return FileResponse(p, filename=rec.original_name or "khata.jpg")


@router.post("/khata/apply")
async def apply_khata_sale(body: KhataApplyBody, user: User = Depends(get_current_user)):
    if body.khata_upload_id is not None:
        up = await prisma.khataupload.find_first(
            where={"id": body.khata_upload_id, "user_id": user.id}
        )
        if not up:
            raise HTTPException(status_code=404, detail="Khata upload not found")

    rows_for_ledger: list[dict] = []
    today = datetime.utcnow().strftime("%Y-%m-%d")

    for line in body.lines:
        item = await prisma.inventoryitem.find_first(
            where={"id": line.inventory_item_id, "user_id": user.id}
        )
        if not item:
            raise HTTPException(status_code=404, detail=f"Inventory item {line.inventory_item_id} not found")
        if float(item.quantity) < float(line.quantity):
            raise HTTPException(
                status_code=400,
                detail=f"Not enough stock for {item.name}: have {item.quantity}, need {line.quantity}",
            )

        old_q = float(item.quantity)
        new_q = old_q - float(line.quantity)
        th = float(item.reorder_threshold)
        old_ce = getattr(item, "stock_ceiling", None)
        ceiling = max(float(old_ce) if old_ce is not None else 0.0, old_q, th * 5.0)
        await prisma.inventoryitem.update(
            where={"id": item.id},
            data={"quantity": new_q, "stock_ceiling": ceiling},
        )

        rows_for_ledger.append(
            {
                "date": today,
                "amount": float(line.amount_inr),
                "type": "credit",
                "description": f"Khata sale: {item.name} x{line.quantity} (user {user.id})",
            }
        )

    n = ingestion_service.append_parsed_transactions(rows_for_ledger, source="ocr")
    items = await prisma.inventoryitem.find_many(where={"user_id": user.id}, order={"name": "asc"})
    return {
        "status": "applied",
        "ledger_rows_added": n,
        "items": [_item_out(r) for r in items],
        "message": f"Recorded {len(body.lines)} sale line(s): stock reduced, ₹ added to cash ledger (credit).",
    }


def _item_out(r) -> dict:
    q = float(r.quantity)
    th = float(r.reorder_threshold)
    ce_raw = getattr(r, "stock_ceiling", None)
    # % of peak capacity: ceiling tracks high-water (restocks raise it; sales do not lower it).
    if ce_raw is not None and float(ce_raw) > 0:
        ce = max(float(ce_raw), q, 1e-9)
        pct = min(100.0, max(0.0, (q / ce) * 100.0))
    else:
        # No ceiling yet (run migration or save item once) – reorder band only.
        denom = max(th * 5.0, 1e-6)
        pct = min(100.0, max(0.0, (q / denom) * 100.0))
    status = "low" if q <= th else "ok"
    last_bill = None
    if getattr(r, "last_bill_deduct_at", None) is not None:
        last_bill = r.last_bill_deduct_at.isoformat() if hasattr(r.last_bill_deduct_at, "isoformat") else str(r.last_bill_deduct_at)
    return {
        "id": r.id,
        "sku": r.sku,
        "name": r.name,
        "quantity": q,
        "unit": r.unit,
        "reorder_threshold": th,
        "stock_pct": round(pct, 1),
        "status": status,
        "last_bill_deduct_at": last_bill,
    }
