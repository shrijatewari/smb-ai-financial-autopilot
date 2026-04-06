"""OCR / invoice extraction – delegates to document + OCR services."""

from __future__ import annotations

from typing import Any

from services import ocr_service


def extract_transactions_from_image(
    content: bytes,
    filename: str = "document",
    content_type: str | None = None,
) -> list[dict[str, Any]]:
    """Extract structured transaction rows from invoice or receipt image bytes."""
    return ocr_service.extract_invoice_transactions(content, filename=filename, content_type=content_type)
