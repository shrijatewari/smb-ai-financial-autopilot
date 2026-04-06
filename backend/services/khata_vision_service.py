"""
Handwritten khata (ledger) understanding via multimodal LLM – similar to Gemini / ChatGPT photo chat.

Uses OpenAI vision when OPENAI_API_KEY is set; otherwise returns empty suggestions (upload still works).
"""

from __future__ import annotations

import json
import logging
import mimetypes
import os
import re
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


def _mime_for_path(path: Path) -> str:
    mt, _ = mimetypes.guess_type(str(path))
    if mt and mt.startswith("image/"):
        return mt
    suf = path.suffix.lower()
    if suf in (".jpg", ".jpeg"):
        return "image/jpeg"
    if suf == ".png":
        return "image/png"
    if suf == ".webp":
        return "image/webp"
    if suf == ".gif":
        return "image/gif"
    return "image/jpeg"


def _match_inventory_id(product_name: str, items: list[Any]) -> int | None:
    """Fuzzy match AI product string to user's inventory rows."""
    if not product_name or not items:
        return None
    pn = product_name.lower().strip()
    best_id: int | None = None
    best_ratio = 0.0
    for it in items:
        for candidate in (getattr(it, "name", None), getattr(it, "sku", None)):
            if not candidate:
                continue
            c = str(candidate).lower().strip()
            if not c:
                continue
            if pn == c or pn in c or c in pn:
                return int(it.id)
            r = SequenceMatcher(None, pn, c).ratio()
            if r > best_ratio:
                best_ratio = r
                best_id = int(it.id)
    if best_ratio >= 0.55:
        return best_id
    return None


def _parse_json_object(raw: str) -> dict[str, Any]:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    return json.loads(raw)


def analyze_khata_image_bytes(
    image_bytes: bytes,
    mime: str,
    inventory_items: list[Any],
) -> dict[str, Any]:
    """
    Returns:
      suggested_lines: list of { product_name, quantity, amount_inr, raw_text, confidence, matched_inventory_item_id }
      notes: str
      vision_status: ok | skipped_no_api_key | error | skipped_empty
    """
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        return {
            "suggested_lines": [],
            "notes": "",
            "vision_status": "skipped_no_api_key",
        }

    try:
        from openai import OpenAI
    except ImportError:
        logger.warning("openai package not installed")
        return {"suggested_lines": [], "notes": "", "vision_status": "error"}

    import base64

    b64 = base64.standard_b64encode(image_bytes).decode("ascii")
    data_url = f"data:{mime};base64,{b64}"

    inventory_hint = ""
    if inventory_items:
        parts = []
        for it in inventory_items[:40]:
            parts.append(f'"{it.name}" (id={it.id}, sku={it.sku})')
        inventory_hint = (
            "The shop already has these products in inventory (prefer matching names to these when possible):\n"
            + ", ".join(parts)
            + "\n"
        )

    model = os.environ.get("OPENAI_KHATA_MODEL", "gpt-4o-mini")
    system = (
        "You read handwritten Indian shop ledgers (khata). "
        "Text may be Hindi, English, Hinglish, or numerals. "
        "Extract each distinct sale or money-received line: product, quantity, amount in INR. "
        "Ignore headers and totals if they are clearly not a line item. "
        "If unsure, lower confidence. Return ONLY valid JSON."
    )
    user_text = (
        inventory_hint
        + "Analyze this khata page image. Return JSON with this exact shape:\n"
        '{"lines":[{"product_name":"string","quantity":number or null,"amount_inr":number or null,'
        '"raw_text":"what you read","confidence":0.0 to 1.0}],'
        '"notes":"one short sentence in Hindi + English for the shopkeeper"}\n'
        "If nothing is readable, return lines: []."
    )

    client = OpenAI(api_key=key)
    try:
        resp = client.chat.completions.create(
            model=model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_text},
                        {"type": "image_url", "image_url": {"url": data_url, "detail": "high"}},
                    ],
                },
            ],
            max_tokens=2000,
            temperature=0.2,
        )
    except Exception as e:
        logger.warning("khata vision API error: %s", e)
        return {
            "suggested_lines": [],
            "notes": str(e)[:200],
            "vision_status": "error",
        }

    content = (resp.choices[0].message.content or "").strip()
    if not content:
        return {"suggested_lines": [], "notes": "", "vision_status": "skipped_empty"}

    try:
        data = _parse_json_object(content)
    except json.JSONDecodeError as e:
        logger.warning("khata vision JSON parse: %s", e)
        return {
            "suggested_lines": [],
            "notes": content[:300],
            "vision_status": "error",
        }

    raw_lines = data.get("lines") or []
    notes = str(data.get("notes") or "").strip()

    out: list[dict[str, Any]] = []
    for row in raw_lines:
        if not isinstance(row, dict):
            continue
        pname = str(row.get("product_name") or "").strip()
        if not pname and not row.get("raw_text"):
            continue
        qty = row.get("quantity")
        amt = row.get("amount_inr")
        try:
            q_float = float(qty) if qty is not None and qty != "" else None
        except (TypeError, ValueError):
            q_float = None
        try:
            a_float = float(amt) if amt is not None and amt != "" else None
        except (TypeError, ValueError):
            a_float = None

        conf = row.get("confidence")
        try:
            c = float(conf) if conf is not None else 0.7
        except (TypeError, ValueError):
            c = 0.7
        c = max(0.0, min(1.0, c))

        display_name = pname or str(row.get("raw_text") or "Item")

        out.append(
            {
                "product_name": display_name,
                "quantity": q_float,
                "amount_inr": a_float,
                "raw_text": str(row.get("raw_text") or pname),
                "confidence": round(c, 2),
                "matched_inventory_item_id": _match_inventory_id(display_name, inventory_items),
            }
        )

    return {
        "suggested_lines": out,
        "notes": notes,
        "vision_status": "ok" if out else "skipped_empty",
    }


def analyze_khata_file(path: Path, inventory_items: list[Any]) -> dict[str, Any]:
    if not path.is_file():
        return {"suggested_lines": [], "notes": "", "vision_status": "error"}
    raw = path.read_bytes()
    mime = _mime_for_path(path)
    return analyze_khata_image_bytes(raw, mime, inventory_items)
