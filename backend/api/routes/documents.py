"""Document upload → OCR → business profile (feeds onboarding + system engine)."""

from __future__ import annotations

import logging
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from auth.deps import get_current_user
from db.prisma_client import prisma
from prisma.fields import Json
from prisma.models import User
from services import state_store
from services.document_service import analyze_texts, apply_document_profile_to_user
from services.onboarding_persistence import ensure_user_business_context_loaded
from services.ocr_service import extract_text

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/upload")
async def upload_documents(
    files: Annotated[list[UploadFile], File(description="PDF, PNG, JPG, or text exports")],
    user: User = Depends(get_current_user),
):
    """
    Accept multiple invoices / GST PDFs / images. OCR each file, infer business context, merge into profile.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    texts: list[str] = []
    results: list[dict] = []
    # Aligned (filename, text preview) for DB – do not zip(files, texts) after skips (length mismatch).
    persist_rows: list[tuple[str, str]] = []

    for f in files:
        raw = await f.read()
        if not raw:
            continue
        text = extract_text(raw, f.filename or "document", f.content_type)
        t = text or ""
        texts.append(t)
        fn = (f.filename or "document")[:500]
        results.append({"filename": fn, "extracted_text": t[:500]})
        persist_rows.append((fn, t[:800]))

    if not any(s.strip() for s in texts):
        raise HTTPException(
            status_code=422,
            detail=(
                "No text extracted. For scanned PDFs and images: set GOOGLE_APPLICATION_CREDENTIALS "
                "(Vision service account JSON), or GOOGLE_VISION_API_KEY, or install Tesseract on PATH. "
                "Ensure pymupdf is installed for PDF page rendering. Optional: OCR_PDF_MAX_PAGES (default 10)."
            ),
        )

    profile = analyze_texts(texts)
    await ensure_user_business_context_loaded(user.id)
    apply_document_profile_to_user(user.id, profile)

    # Prisma JSON columns expect Json(...) – plain dict can cause 500 on create.
    try:
        for fn, preview in persist_rows:
            await prisma.documentrecord.create(
                data={
                    "user_id": user.id,
                    "doc_type": "invoice_or_statement",
                    "file_url": f"uploaded://{fn}"[:2048],
                    "parsed_data": Json({"filename": fn, "text_preview": preview}),
                    "confidence": Decimal("0.55"),
                }
            )
    except Exception as e:
        logger.exception("documentrecord create failed")
        raise HTTPException(
            status_code=503,
            detail=(
                "Could not save document rows. Run `prisma db push` (or migrate) so the `documents` table exists. "
                f"Error: {e!s}"
            ),
        ) from e

    return {
        "documents_processed": len(persist_rows),
        "status": "success",
        "results": results,
        "profile": profile,
    }


@router.get("/profile")
def get_document_profile(user: User = Depends(get_current_user)):
    """Latest OCR-derived business profile for the current user."""
    p = state_store.get_document_profile(user.id)
    if not p:
        return {"profile": None}
    return {"profile": p}
