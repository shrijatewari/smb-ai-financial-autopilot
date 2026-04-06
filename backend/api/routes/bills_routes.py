"""Bill ingest (POS JSON + OCR upload) and history."""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from auth.deps import get_current_user
from db.prisma_client import prisma
from prisma.models import User
from services.bill_ocr_parser import parse_bill_ocr_text
from services.bill_service import process_bill_ingest
from services.ocr_service import extract_text

router = APIRouter()

_BILL_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "bills"


def _safe_name(name: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9._-]+", "_", name)[:120]
    return base or "upload"


from pydantic import BaseModel, Field


class BillLineIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    qty: float = Field(..., gt=0, le=1e6)
    unit_price: float = Field(..., ge=0, le=1e9)


class BillIngestJsonBody(BaseModel):
    bill_number: str = Field(..., min_length=1, max_length=128)
    timestamp: str | None = None
    total_amount: float = Field(..., ge=0, le=1e12)
    customer_phone: str | None = Field(None, max_length=20)
    customer_name: str | None = Field(None, max_length=255)
    line_items: list[BillLineIn] = Field(..., min_length=1)
    udhar: bool = False


def _parse_ts(raw: str | None) -> datetime | None:
    if not raw:
        return None
    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw[:19], fmt)
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


@router.post("/ingest-json")
async def post_ingest_json(body: BillIngestJsonBody, user: User = Depends(get_current_user)):
    raw = body.model_dump()
    occurred = _parse_ts(body.timestamp)
    line_items = [li.model_dump() for li in body.line_items]
    try:
        out = await process_bill_ingest(
            user.id,
            bill_number=body.bill_number.strip(),
            source="api",
            line_items=line_items,
            total_amount=float(body.total_amount),
            customer_phone=body.customer_phone,
            customer_name=body.customer_name,
            raw_payload=raw,
            file_path=None,
            udhar=body.udhar,
            occurred_at=occurred,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e
    return {
        "status": out["status"],
        "bill_id": out["bill_id"],
        "items_updated": out["items_updated"],
        "unknown_items": out["unknown_items"],
        "khaata_linked": out["khaata_linked"],
    }


@router.post("/ingest-ocr")
async def post_ingest_ocr(
    user: User = Depends(get_current_user),
    file: UploadFile = File(...),
    udhar: str = Form("false"),
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Missing file")
    raw_bytes = await file.read()
    if not raw_bytes or len(raw_bytes) > 12 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File empty or too large (max 12MB)")

    udhar_flag = str(udhar).lower() in ("1", "true", "yes", "on")

    user_dir = _BILL_DIR / str(user.id)
    user_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename).suffix.lower() or ".bin"
    if ext not in (".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif"):
        ext = ".bin"
    fname = f"{uuid.uuid4().hex}_{_safe_name(file.filename)}{ext}"
    path = user_dir / fname
    path.write_bytes(raw_bytes)

    text = ""
    try:
        text = extract_text(raw_bytes, filename=file.filename or "upload", content_type=file.content_type)
    except Exception:
        text = ""

    parsed = parse_bill_ocr_text(text)
    line_items = parsed.get("line_items") or []
    if not line_items:
        # Record failed parse bill row for audit
        try:
            from prisma.fields import Json

            b = await prisma.bill.create(
                data={
                    "user_id": user.id,
                    "bill_number": str(parsed.get("bill_number") or "OCR-FAIL")[:128],
                    "source": "ocr",
                    "raw_payload": Json({"ocr_text_sample": text[:2000]}),
                    "parsed_items": Json({"lines": [], "unknown": [], "error": "no_line_items"}),
                    "total_amount": 0,
                    "customer_phone": parsed.get("customer_phone"),
                    "customer_name": parsed.get("customer_name"),
                    "file_path": str(path),
                    "status": "failed",
                    "error_message": "Could not parse line items from OCR",
                }
            )
        except Exception:
            pass
        return {
            "status": "failed",
            "bill_id": None,
            "items_updated": 0,
            "unknown_items": [],
            "khaata_linked": False,
            "error": "Could not parse line items",
            "parsed_preview": parsed,
        }

    total = float(parsed.get("total_amount") or 0)
    if total <= 0:
        try:
            total = sum(float(x["qty"]) * float(x["unit_price"]) for x in line_items)
        except (KeyError, TypeError, ValueError):
            total = 0.0

    occurred = None
    ts = parsed.get("timestamp")
    if ts:
        occurred = _parse_ts(str(ts))

    try:
        out = await process_bill_ingest(
            user.id,
            bill_number=str(parsed.get("bill_number") or f"OCR-{uuid.uuid4().hex[:8]}")[:128],
            source="ocr",
            line_items=line_items,
            total_amount=total,
            customer_phone=parsed.get("customer_phone"),
            customer_name=parsed.get("customer_name"),
            raw_payload={"ocr_text_sample": text[:4000], "parsed": parsed},
            file_path=str(path),
            udhar=udhar_flag,
            occurred_at=occurred,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

    return {
        "status": out["status"],
        "bill_id": out["bill_id"],
        "items_updated": out["items_updated"],
        "unknown_items": out["unknown_items"],
        "khaata_linked": out["khaata_linked"],
        "parsed_preview": parsed,
    }


@router.get("/history")
async def get_bill_history(user: User = Depends(get_current_user)):
    rows = await prisma.bill.find_many(
        where={"user_id": user.id},
        order={"created_at": "desc"},
        take=20,
    )
    items: list[dict[str, Any]] = []
    for r in rows:
        parsed = r.parsed_items if isinstance(r.parsed_items, dict) else {}
        lines = parsed.get("lines") or []
        unk = parsed.get("unknown") or []
        items_updated = sum(1 for x in lines if isinstance(x, dict) and x.get("matched"))
        items.append(
            {
                "id": r.id,
                "timestamp": r.created_at.isoformat() if r.created_at else None,
                "source": r.source,
                "total_amount": float(r.total_amount),
                "items_updated_count": items_updated,
                "unknown_count": len(unk) if isinstance(unk, list) else 0,
                "khaata_linked": False,
                "status": r.status,
                "bill_number": r.bill_number,
            }
        )
    # Fill khaata_linked: customers pointing to this bill
    bill_ids = [x["id"] for x in items]
    if bill_ids:
        custs = await prisma.customer.find_many(
            where={"user_id": user.id, "bill_id": {"in": bill_ids}},
        )
        linked = {c.bill_id for c in custs if c.bill_id}
        for it in items:
            it["khaata_linked"] = it["id"] in linked
    return {"items": items}


@router.get("/{bill_id}/file")
async def get_bill_file(bill_id: int, user: User = Depends(get_current_user)):
    from fastapi.responses import FileResponse

    b = await prisma.bill.find_first(where={"id": bill_id, "user_id": user.id})
    if not b or not b.file_path:
        raise HTTPException(status_code=404, detail="Bill file not found")
    p = Path(b.file_path)
    if not p.is_file():
        raise HTTPException(status_code=404, detail="File missing on disk")
    return FileResponse(p, filename=p.name)


@router.get("/{bill_id}/detail")
async def get_bill_detail(bill_id: int, user: User = Depends(get_current_user)):
    b = await prisma.bill.find_first(where={"id": bill_id, "user_id": user.id})
    if not b:
        raise HTTPException(status_code=404, detail="Bill not found")
    parsed = b.parsed_items if isinstance(b.parsed_items, dict) else {}
    return {
        "id": b.id,
        "bill_number": b.bill_number,
        "source": b.source,
        "total_amount": float(b.total_amount),
        "status": b.status,
        "parsed_items": parsed,
        "customer_phone": b.customer_phone,
        "customer_name": b.customer_name,
        "file_path": b.file_path,
        "created_at": b.created_at.isoformat() if b.created_at else None,
    }
