"""
Multilingual wrapper: detect query language → English for core assistant → translate reply + optional TTS.
"""

from __future__ import annotations

from pathlib import Path

from services.assistant_service import run_assistant
from services.language_service import detect_language, has_devanagari, normalize_output_lang
from services.translation_service import polish_tone_openai, translate_from_english, translate_to_english
from services.tts_service import synthesize_to_mp3

_BACKEND = Path(__file__).resolve().parent.parent
_MEDIA = _BACKEND / "media"


def run_assistant_multilingual(
    query: str,
    *,
    output_language: str | None,
    tone: str,
    include_audio: bool,
    initial_balance: float,
    horizon_days: int | None,
) -> dict[str, object]:
    out_lang = normalize_output_lang(output_language)
    q_lang = detect_language(query)
    if has_devanagari(query) and q_lang == "en":
        q_lang = "hi"

    query_en = query if q_lang == "en" else translate_to_english(query, q_lang)

    core = run_assistant(
        query_en,
        initial_balance=initial_balance,
        horizon_days=horizon_days,
    )
    response_en = str(core.get("response") or "")

    if out_lang == "en":
        reply = response_en
    else:
        reply = translate_from_english(response_en, out_lang)
        reply = polish_tone_openai(reply, out_lang, tone)

    core["response"] = reply
    core["detected_query_language"] = q_lang
    core["output_language"] = out_lang

    audio_url = None
    if include_audio:
        rel = synthesize_to_mp3(reply, out_lang, _MEDIA)
        if rel is not None:
            audio_url = f"/media/{rel.as_posix()}"

    core["audio_url"] = audio_url
    return core
