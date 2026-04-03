"""
Translate between English (system language) and user languages via Google Translate (deep-translator).
Falls back to original text if translation fails (offline / rate limit).
"""

from __future__ import annotations

import logging
import os

from deep_translator import GoogleTranslator

logger = logging.getLogger(__name__)

# deep-translator uses ISO-ish codes; map a few aliases
_GOOGLE_SOURCE_MAP = {
    "en": "en",
    "hi": "hi",
    "ta": "ta",
    "te": "te",
    "kn": "kn",
    "ml": "ml",
    "mr": "mr",
    "bn": "bn",
    "gu": "gu",
    "pa": "pa",
    "ur": "ur",
}


def _translator(source: str, target: str) -> GoogleTranslator:
    s = _GOOGLE_SOURCE_MAP.get(source, source)
    t = _GOOGLE_SOURCE_MAP.get(target, target)
    return GoogleTranslator(source=s, target=t)


def translate_text(text: str, source: str, target: str) -> str:
    if not (text or "").strip() or source == target:
        return text
    try:
        return _translator(source, target).translate(text)
    except Exception as e:  # pragma: no cover
        logger.warning("translate_text failed: %s", e)
        return text


def translate_to_english(text: str, source_lang: str) -> str:
    if source_lang == "en":
        return text
    return translate_text(text, source_lang, "en")


def translate_from_english(text: str, target_lang: str, *, tone: str = "formal") -> str:
    if target_lang == "en":
        return text
    return translate_text(text, "en", target_lang)


def polish_tone_openai(text: str, target_lang: str, tone: str) -> str:
    """Optional: rewrite in friendly Hinglish / conversational tone when OPENAI_API_KEY is set."""
    if tone != "friendly" or target_lang not in ("hi", "en"):
        return text
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        return text
    try:
        from openai import OpenAI

        client = OpenAI()
        sys = (
            "You rewrite short financial assistant messages. Keep numbers and ₹ amounts exactly. "
            "Output only the rewritten message, same language as the input."
        )
        user = (
            f"Tone: {'formal, respectful' if tone == 'formal' else 'warm, conversational Hinglish where natural'}.\n\n"
            f"{text}"
        )
        r = client.chat.completions.create(
            model=os.environ.get("OPENAI_TONE_MODEL", "gpt-4o-mini"),
            messages=[{"role": "system", "content": sys}, {"role": "user", "content": user}],
            max_tokens=500,
            temperature=0.3,
        )
        out = (r.choices[0].message.content or "").strip()
        return out or text
    except Exception as e:  # pragma: no cover
        logger.warning("polish_tone_openai: %s", e)
        return text
