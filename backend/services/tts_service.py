"""
Text-to-speech via gTTS (Hindi, English, regional codes gTTS supports).
Writes MP3 under media/assistant_tts/.
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path

from gtts import gTTS

logger = logging.getLogger(__name__)

# gTTS lang codes – subset aligned with our output languages
_GTTS_LANG = {
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

_MAX_CHARS = 4500


def _clip(text: str) -> str:
    t = (text or "").strip()
    if len(t) <= _MAX_CHARS:
        return t
    # Avoid cutting mid-sentence when possible
    cut = t[:_MAX_CHARS]
    last = max(cut.rfind("।"), cut.rfind("."), cut.rfind(","))
    if last > _MAX_CHARS // 2:
        return cut[: last + 1]
    return cut + "…"


def synthesize_to_mp3(text: str, lang: str, media_dir: Path) -> Path | None:
    """
    Save MP3 file; return path relative to media root (e.g. assistant_tts/uuid.mp3).
    Returns None if text empty or synthesis fails.
    """
    t = _clip(text)
    if not t:
        return None
    code = _GTTS_LANG.get(lang, "en")
    media_dir = Path(media_dir)
    out_dir = media_dir / "assistant_tts"
    out_dir.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.mp3"
    path = out_dir / name
    try:
        tts = gTTS(text=t, lang=code, slow=False)
        tts.save(str(path))
        return Path("assistant_tts") / name
    except Exception as e:  # pragma: no cover
        logger.warning("gTTS failed: %s", e)
        return None
