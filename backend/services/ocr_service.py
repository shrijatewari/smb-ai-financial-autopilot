"""
OCR for uploads: Google Cloud Vision client (service account JSON), else REST API key,
else Tesseract, else PDF text layer.

- Set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON (e.g. backend/ocr_key.json).
- Or set GOOGLE_VISION_API_KEY for REST annotate (no JSON file).
"""

from __future__ import annotations

import base64
import os
import shutil
import re
from datetime import datetime
from typing import Any

import requests

# Mock line item when Vision unavailable
_MOCK_ITEMS = [
    {"description": "Professional services", "amount": 12500.0},
    {"description": "Supplies", "amount": 3200.0},
]


def _mock_extract_from_text(text: str) -> list[dict[str, Any]]:
    """Regex fallback on UTF-8 decoded bytes or pasted invoice text."""
    rows = []
    amt_pat = re.compile(r"(?:total|amount|Rs\.?|INR)\s*[:\s]*([\d,]+(?:\.\d{2})?)", re.I)
    date_pat = re.compile(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b")
    amounts = [float(x.replace(",", "")) for x in amt_pat.findall(text)]
    dtm = date_pat.search(text)
    day = datetime.now()
    if dtm:
        d, m, y = int(dtm.group(1)), int(dtm.group(2)), int(dtm.group(3))
        if y < 100:
            y += 2000
        try:
            day = datetime(y, m, d)
        except ValueError:
            pass
    if amounts:
        total = max(amounts)
        rows.append(
            {
                "date": day.strftime("%Y-%m-%d"),
                "amount": total,
                "type": "debit",
                "description": f"OCR invoice (mock): {text[:80]}...",
                "items": _MOCK_ITEMS,
                "_source": "ocr",
            }
        )
    else:
        rows.append(
            {
                "date": day.strftime("%Y-%m-%d"),
                "amount": 8900.0,
                "type": "debit",
                "description": "OCR invoice (mock default line)",
                "items": list(_MOCK_ITEMS),
                "_source": "ocr",
            }
        )
    return rows


_vision_image_client = None
_tesseract_configured = False


def _ensure_tesseract_cmd() -> None:
    """Point pytesseract at tesseract when PATH is minimal (e.g. IDE-launched uvicorn)."""
    global _tesseract_configured
    if _tesseract_configured:
        return
    _tesseract_configured = True
    try:
        import pytesseract
    except ImportError:
        return

    override = os.environ.get("TESSERACT_CMD", "").strip()
    if override:
        pytesseract.pytesseract.tesseract_cmd = override
        return

    for candidate in (
        "/opt/homebrew/bin/tesseract",
        "/usr/local/bin/tesseract",
    ):
        if os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            pytesseract.pytesseract.tesseract_cmd = candidate
            return

    resolved = shutil.which("tesseract")
    if resolved:
        pytesseract.pytesseract.tesseract_cmd = resolved


def extract_text_from_image(file_bytes: bytes) -> str:
    """
    OCR image bytes via Google Cloud Vision (`text_detection`).

    Set `GOOGLE_APPLICATION_CREDENTIALS` to your service account JSON
    (e.g. `export GOOGLE_APPLICATION_CREDENTIALS=./ocr_key.json` from `backend/`).
    Returns empty string if the SDK is missing, credentials are invalid, or the call fails.
    """
    if not file_bytes:
        return ""
    global _vision_image_client
    try:
        from google.cloud import vision

        if _vision_image_client is None:
            _vision_image_client = vision.ImageAnnotatorClient()
        image = vision.Image(content=file_bytes)
        response = _vision_image_client.text_detection(image=image)
        err = getattr(response, "error", None)
        if err is not None and getattr(err, "message", ""):
            return ""
        texts = response.text_annotations
        if texts:
            return (texts[0].description or "").strip()
        return ""
    except Exception:
        return ""


def _vision_rest(image_bytes: bytes, api_key: str) -> str:
    """Call Vision API document_text_detection; return raw annotation JSON text."""
    b64 = base64.b64encode(image_bytes).decode("ascii")
    body = {
        "requests": [
            {
                "image": {"content": b64},
                "features": [{"type": "DOCUMENT_TEXT_DETECTION", "maxResults": 1}],
            }
        ]
    }
    url = f"https://vision.googleapis.com/v1/images:annotate?key={api_key}"
    r = requests.post(url, json=body, timeout=45)
    r.raise_for_status()
    data = r.json()
    responses = data.get("responses", [{}])
    if not responses:
        return ""
    ann = responses[0].get("fullTextAnnotation", {})
    return ann.get("text", "")


def extract_invoice_transactions(
    file_bytes: bytes,
    filename: str = "upload",
    content_type: str | None = None,
) -> list[dict[str, Any]]:
    """
    Extract structured transactions from an invoice image/PDF page (image bytes).

    Uses Google Vision if GOOGLE_VISION_API_KEY is set; otherwise mock heuristics.
    """
    api_key = os.environ.get("GOOGLE_VISION_API_KEY", "").strip()
    text = ""

    if api_key and file_bytes:
        try:
            text = _vision_rest(file_bytes, api_key)
        except Exception:
            text = ""

    if not text:
        try:
            text = file_bytes.decode("utf-8", errors="ignore")
        except Exception:
            text = ""

    if not text.strip():
        text = f"Invoice {filename} Total Rs. 12,500.00 dated {datetime.now().strftime('%d/%m/%Y')}"

    rows = _mock_extract_from_text(text)
    for r in rows:
        r.setdefault("items", list(_MOCK_ITEMS))
    return rows


def _ocr_image_bytes(image_bytes: bytes) -> str:
    """Run the same OCR stack as for standalone images: Vision SDK → REST key → Tesseract."""
    if not image_bytes:
        return ""
    api_key = os.environ.get("GOOGLE_VISION_API_KEY", "").strip()
    t0 = extract_text_from_image(image_bytes)
    if t0.strip():
        return t0.strip()
    if api_key:
        try:
            t = _vision_rest(image_bytes, api_key)
            if t.strip():
                return t.strip()
        except Exception:
            pass
    t2 = _tesseract_bytes(image_bytes)
    return t2.strip() if t2 else ""


def _tesseract_bytes(image_bytes: bytes) -> str:
    try:
        from io import BytesIO

        import pytesseract
        from PIL import Image

        _ensure_tesseract_cmd()
        im = Image.open(BytesIO(image_bytes))
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        return pytesseract.image_to_string(im, lang="eng")
    except Exception:
        return ""


def _pypdf_text(pdf_bytes: bytes) -> str:
    try:
        from io import BytesIO

        from pypdf import PdfReader

        reader = PdfReader(BytesIO(pdf_bytes))
        parts: list[str] = []
        for page in reader.pages[:30]:
            t = page.extract_text() or ""
            if t.strip():
                parts.append(t)
        return "\n".join(parts)
    except Exception:
        return ""


def _fitz_extract_text(pdf_bytes: bytes) -> str:
    """PyMuPDF text layer (sometimes works when pypdf does not)."""
    try:
        import fitz

        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        parts: list[str] = []
        try:
            for i in range(min(len(doc), 30)):
                t = doc[i].get_text()
                if t and t.strip():
                    parts.append(t)
        finally:
            doc.close()
        return "\n".join(parts)
    except Exception:
        return ""


def _pdf_pages_as_images_ocr(pdf_bytes: bytes) -> str:
    """
    Rasterize PDF pages and OCR each (scanned / image-only bank statements).

    Uses PyMuPDF (no external poppler). Requires Vision credentials or Tesseract on PATH.
    """
    try:
        import fitz
    except ImportError:
        return ""

    max_pages = int(os.environ.get("OCR_PDF_MAX_PAGES", "10"))
    max_pages = max(1, min(max_pages, 30))
    zoom = float(os.environ.get("OCR_PDF_RENDER_ZOOM", "2.0"))
    zoom = max(1.0, min(zoom, 4.0))

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        parts: list[str] = []
        try:
            n = min(len(doc), max_pages)
            mat = fitz.Matrix(zoom, zoom)
            for i in range(n):
                page = doc[i]
                pix = page.get_pixmap(matrix=mat, alpha=False)
                png_bytes = pix.tobytes("png")
                txt = _ocr_image_bytes(png_bytes)
                if txt.strip():
                    parts.append(txt)
        finally:
            doc.close()
        return "\n\n---PAGE---\n\n".join(parts)
    except Exception:
        return ""


def extract_text(
    file_bytes: bytes,
    filename: str = "upload",
    content_type: str | None = None,
) -> str:
    """
    OCR / extract plain text from uploads.

    Priority (images):
    1) Google Cloud Vision client (`GOOGLE_APPLICATION_CREDENTIALS` + google-cloud-vision)
    2) Vision REST API when `GOOGLE_VISION_API_KEY` is set
    3) Tesseract (pytesseract + Pillow) if installed

    PDFs: pypdf text → PyMuPDF text → rasterize pages + same OCR as images (scanned PDFs).
    Text-like: UTF-8 decode.
    """
    fn = (filename or "").lower()
    ct = (content_type or "").lower()

    if not file_bytes:
        return ""

    if ct.startswith("image/") or fn.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff")):
        out = _ocr_image_bytes(file_bytes)
        return out

    if fn.endswith(".pdf") or ct == "application/pdf":
        t = _pypdf_text(file_bytes)
        if t.strip():
            return t.strip()
        t = _fitz_extract_text(file_bytes)
        if t.strip():
            return t.strip()
        t = _pdf_pages_as_images_ocr(file_bytes)
        if t.strip():
            return t.strip()
        return ""

    if ct.startswith("text/") or fn.endswith((".txt", ".csv", ".md")):
        try:
            return file_bytes.decode("utf-8", errors="ignore")
        except Exception:
            return ""

    # Unknown binary – try UTF-8 then empty
    try:
        s = file_bytes.decode("utf-8", errors="ignore")
        if len(s) > 40 and sum(c.isprintable() or c in "\n\r\t" for c in s) / max(len(s), 1) > 0.85:
            return s
    except Exception:
        pass
    return ""
