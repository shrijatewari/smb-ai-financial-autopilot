"""CSV upload route."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from schemas.transaction_schema import UploadSummary
from services import ingestion_service

router = APIRouter(tags=["ingestion"])


@router.post("/upload", response_model=UploadSummary)
async def upload_transactions(request: Request):
    """
    Accept a CSV file, validate columns, store in session, return row count and net signed total.

    Uses Request.form() instead of UploadFile/File() so the app imports without
    python-multipart; install it for runtime multipart parsing.
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
    filename = getattr(file, "filename", None) or ""
    if not filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a .csv file")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")

    try:
        _, summary = ingestion_service.ingest_upload(content)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    return UploadSummary(
        rows=summary["rows"],
        total_amount_signed=summary["total_amount_signed"],
        message="Upload accepted. Use GET /dashboard for full analysis.",
    )
