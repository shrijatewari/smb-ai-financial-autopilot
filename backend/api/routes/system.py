"""Single read model: latest engine snapshot."""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, Depends, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse

from auth.deps import get_current_user_optional
from auth.jwt_tokens import decode_token
from db.prisma_client import prisma
from prisma.models import User
from services.system_snapshot import build_system_snapshot

router = APIRouter()


async def _user_from_sse_token(token: str | None) -> User | None:
    """JWT from query string — EventSource in browsers cannot send Authorization headers."""
    if not token or not token.strip():
        return None
    payload = decode_token(token.strip())
    if not payload or "sub" not in payload:
        return None
    try:
        uid = int(str(payload["sub"]))
    except (TypeError, ValueError):
        return None
    return await prisma.user.find_unique(where={"id": uid})


@router.get("/state")
async def get_system_state(user: User | None = Depends(get_current_user_optional)):
    """
    Live system snapshot (updated every few seconds by the background engine).

    When authenticated, **modules**, **profile_type**, and **document_profile** come from **this user's**
    onboarding + document intelligence — not the global engine-only mirror. Cash/risk/forecast still come
    from the shared control-plane tick.
    """
    return await build_system_snapshot(user)


@router.get("/stream")
async def system_stream(
    request: Request,
    token: str | None = Query(
        None,
        description="JWT (same as `Authorization: Bearer`). Required for EventSource; browsers cannot send headers.",
    ),
):
    """
    Server-Sent Events: push snapshot JSON every ~3 seconds (same payload as GET /system/state).

    Connect with `EventSource('/api/system/stream?token=...')` in the browser (use `vite` proxy in dev).
    """
    user = await _user_from_sse_token(token)

    async def event_stream():
        while True:
            if await request.is_disconnected():
                break
            snap = await build_system_snapshot(user)
            payload = json.dumps(jsonable_encoder(snap))
            yield f"data: {payload}\n\n"
            await asyncio.sleep(3)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
