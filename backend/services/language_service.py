"""
Detect user query language (India-first: Hindi script, langdetect, extensible codes).
"""

from __future__ import annotations

import re

from langdetect import LangDetectException, detect

# ISO 639-1 codes we support for output + translation targets
SUPPORTED_LANGS = frozenset(
    {"en", "hi", "ta", "te", "kn", "ml", "mr", "bn", "gu", "pa", "ur"}
)


def has_devanagari(text: str) -> bool:
    return bool(re.search(r"[\u0900-\u097F]", text or ""))


# Latin-script Hindi / Hinglish – common in spoken queries (judges' demo path)
_HINGLISH_LATIN = re.compile(
    r"\b(mera|mere|meri|mujhe|hum|aap|kya|kaise|kab|kitna|kitni|hai|ho|hain|hoga|"
    r"bhai|yaar|paisa|paise|din|dinon|abhi|kal|aaj|"
    r"karna|karo|chahiye|rahna|wala|wali|sabse|kam|zyada|theek|acha|accha|matlab)\b",
    re.I,
)


def detect_language(text: str) -> str:
    """
    Return a 2-letter language code. Biases toward Hindi when Devanagari is present.
    """
    t = (text or "").strip()
    if not t:
        return "en"
    if has_devanagari(t):
        try:
            code = detect(t)
            if code in ("hi", "mr", "ne"):
                return code
        except LangDetectException:
            pass
        return "hi"
    if _HINGLISH_LATIN.search(t):
        return "hi"
    try:
        code = detect(t)
        if code in SUPPORTED_LANGS:
            return code
        if code == "id":  # common false positive for short Hinglish
            return "en"
        return code[:2] if len(code) >= 2 else "en"
    except LangDetectException:
        return "en"


def normalize_output_lang(code: str | None) -> str:
    """UI / API language selector → canonical code (default English)."""
    if not code:
        return "en"
    c = str(code).lower().strip()
    if c.startswith("hinglish"):
        return "hi"
    # accept hi-IN etc.
    base = c.split("-")[0][:2]
    if base in SUPPORTED_LANGS:
        return base
    return "en"
