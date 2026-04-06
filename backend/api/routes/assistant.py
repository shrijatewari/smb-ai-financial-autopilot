"""Voice/text assistant – multilingual (India-first) + financial engines."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from pydantic import BaseModel, Field

from services.assistant_multilingual import run_assistant_multilingual
from services.speech_to_text import transcribe_audio_bytes

router = APIRouter()


class AssistantQueryBody(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    language: str | None = Field(
        None,
        description="Output language: en, hi, ta, te, kn, ml, mr, bn (default: en).",
    )
    tone: Literal["formal", "friendly"] = Field(
        "formal",
        description="Formal vs friendly/Hinglish polish when OPENAI_API_KEY is set.",
    )
    include_audio: bool = Field(
        False,
        description="If true, returns audio_url (gTTS MP3) for the reply.",
    )


class AssistantQueryResponse(BaseModel):
    response: str
    intent: str
    data: dict = Field(default_factory=dict)
    language: str | None = Field(None, description="Output language code (e.g. hi, en).")
    detected_query_language: str | None = Field(None, description="Detected language of the user query.")
    audio_url: str | None = Field(None, description="Relative URL to MP3 when include_audio is true.")


@router.post("/query", response_model=AssistantQueryResponse)
def post_assistant_query(
    body: AssistantQueryBody,
    initial_balance: float = Query(10_000.0, ge=0.0),
    horizon_days: int | None = Query(None, ge=5, le=120),
):
    """
    Intent classification → simulation / cash / decision outputs → natural language answer.
    When `language` is not English, the reply is translated; optional TTS via `include_audio`.
    """
    try:
        out = run_assistant_multilingual(
            body.query,
            output_language=body.language,
            tone=body.tone,
            include_audio=body.include_audio,
            initial_balance=initial_balance,
            horizon_days=horizon_days,
        )

        return AssistantQueryResponse(
            response=str(out["response"]),
            intent=str(out["intent"]),
            data=out.get("data") or {},
            language=out.get("output_language"),
            detected_query_language=out.get("detected_query_language"),
            audio_url=out.get("audio_url"),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/query/audio", response_model=AssistantQueryResponse)
async def post_assistant_query_audio(
    file: UploadFile = File(...),
    language: str | None = Form(None),
    tone: str = Form("formal"),
    include_audio: bool = Form(True),
    initial_balance: float = Form(10_000.0),
    horizon_days: int | None = Form(None),
):
    """
    Upload recorded audio → Whisper transcription → same pipeline as POST /assistant/query.
    Requires OPENAI_API_KEY.
    """
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty audio file.")
    try:
        text = transcribe_audio_bytes(raw, filename=file.filename or "audio.webm")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    body = AssistantQueryBody(
        query=text,
        language=language,
        tone=tone if tone in ("formal", "friendly") else "formal",
        include_audio=include_audio,
    )
    return post_assistant_query(
        body,
        initial_balance=initial_balance,
        horizon_days=horizon_days,
    )
