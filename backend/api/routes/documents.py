"""Document upload → OCR → business profile (feeds onboarding + system engine)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

from auth.deps import get_current_user
from prisma.models import User
from services import state_store
from services.document_service import analyze_texts, apply_document_profile_to_user
from services.onboarding_persistence import ensure_user_business_context_loaded
from services.ocr_service import extract_text

router = APIRouter()


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
    for f in files:
        raw = await f.read()
        if not raw:
            continue
        text = extract_text(raw, f.filename or "document", f.content_type)
        texts.append(text or "")
        results.append(
            {
                "filename": f.filename or "document",
                "extracted_text": (text or "")[:500],
            }
        )

    if not any(t.strip() for t in texts):
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

    return {
        "documents_processed": len(files),
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
