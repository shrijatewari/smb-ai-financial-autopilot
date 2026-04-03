"""
Speech-to-text: OpenAI Whisper API when OPENAI_API_KEY is set; otherwise raises with clear message.
"""

from __future__ import annotations

import io
import logging
import os

logger = logging.getLogger(__name__)


def transcribe_audio_bytes(file_bytes: bytes, filename: str = "audio.webm") -> str:
    """
    Transcribe raw audio (webm, mp3, wav, m4a). Requires OPENAI_API_KEY.
    """
    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        raise ValueError(
            "Speech-to-text requires OPENAI_API_KEY in backend/.env (OpenAI Whisper API)."
        )
    from openai import OpenAI

    client = OpenAI(api_key=key)
    buf = io.BytesIO(file_bytes)
    buf.name = filename or "audio.webm"
    tr = client.audio.transcriptions.create(
        model=os.environ.get("OPENAI_WHISPER_MODEL", "whisper-1"),
        file=buf,
    )
    text = (tr.text or "").strip()
    if not text:
        raise ValueError("Transcription returned empty text.")
    logger.info("whisper transcribed %d chars", len(text))
    return text
