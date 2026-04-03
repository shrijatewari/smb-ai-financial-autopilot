"""SMS, OCR ingestion and payment tracking API."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from services import ingestion_service, payment_tracking
from services import ocr_service, sms_parser

router = APIRouter(prefix="/intelligence", tags=["intelligence"])


class SMSIngestBody(BaseModel):
    text: str = Field(..., description="Raw SMS text (one or more messages)")


@router.post("/ingest/sms")
def ingest_sms(body: SMSIngestBody):
    """Parse bank/UPI SMS and append transactions to the active session ledger."""
    rows = sms_parser.parse_sms_batch(body.text)
    if not rows:
        return {"parsed": 0, "transactions": [], "message": "No amounts matched. Try including Rs./INR and credit/debit wording."}
    n = ingestion_service.append_parsed_transactions(rows, source="sms")
    return {"parsed": n, "transactions": rows, "message": f"Added {n} row(s) from SMS."}


@router.post("/ingest/ocr")
async def ingest_ocr(request: Request):
    """
    Invoice image → structured transactions (Vision API or mock).

    Uses Request + form() instead of UploadFile/File() so the route registers
    without requiring python-multipart at import time (SMS ingest stays available).
    OCR still needs `pip install python-multipart` at runtime to parse multipart bodies.
    """
    try:
        form = await request.form()
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail="Multipart parsing unavailable. Install: pip install python-multipart",
        ) from e
    file = form.get("file")
    if file is None:
        raise HTTPException(status_code=400, detail="Missing form field 'file'")
    content = await file.read()
    filename = getattr(file, "filename", None) or "invoice"
    content_type = getattr(file, "content_type", None)
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    rows = ocr_service.extract_invoice_transactions(
        content,
        filename=filename,
        content_type=content_type,
    )
    n = ingestion_service.append_parsed_transactions(rows, source="ocr")
    return {"parsed": n, "transactions": rows, "message": f"Added {n} row(s) from OCR."}


@router.get("/payments")
def list_payments():
    """All generated payment links and lifecycle status."""
    return {"payments": payment_tracking.list_all()}


@router.post("/payments/{payment_id}/mark-sent")
def mark_payment_sent(payment_id: str):
    ok = payment_tracking.mark_sent(payment_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Unknown payment id or link")
    return {"status": "ok", "id": payment_id}
