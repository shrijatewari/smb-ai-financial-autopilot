"""Single read model: latest engine snapshot."""

from __future__ import annotations

import asyncio
import json
import os
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from auth.deps import get_current_user, get_current_user_optional
from auth.jwt_tokens import decode_token
from db.prisma_client import prisma
from prisma.models import User
from services.system_snapshot import build_system_snapshot

router = APIRouter()


class SyncBatchItem(BaseModel):
    id: str
    method: str = "POST"
    path: str
    body: dict[str, Any] | list[Any] | None = None


class SyncBatchBody(BaseModel):
    items: list[SyncBatchItem] = Field(default_factory=list, max_length=100)


def _safe_sync_path(path: str) -> bool:
    if not path.startswith("/") or ".." in path:
        return False
    if path.rstrip("/") == "/system/sync-batch":
        return False
    return True


async def _user_from_sse_token(token: str | None) -> User | None:
    """JWT from query string – EventSource in browsers cannot send Authorization headers."""
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
    onboarding + document intelligence – not the global engine-only mirror. Cash/risk/forecast still come
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


@router.post("/sync-batch")
async def post_sync_batch(
    body: SyncBatchBody,
    request: Request,
    _user: User = Depends(get_current_user),
):
    """
    Replay queued offline mutations against this same app instance (loopback).
    Each item uses the caller's Authorization header.
    """
    auth = request.headers.get("authorization")
    port = os.environ.get("PORT", "8080")
    base = f"http://127.0.0.1:{port}"
    results: list[dict[str, Any]] = []
    async with httpx.AsyncClient(timeout=120.0) as client:
        for it in body.items:
            if not _safe_sync_path(it.path):
                results.append({"id": it.id, "ok": False, "error": "invalid path"})
                continue
            m = it.method.upper()
            if m not in ("GET", "POST", "PUT", "PATCH", "DELETE"):
                results.append({"id": it.id, "ok": False, "error": "bad method"})
                continue
            try:
                kwargs: dict[str, Any] = {"headers": {"Authorization": auth or ""}}
                if m in ("POST", "PUT", "PATCH", "DELETE") and it.body is not None:
                    kwargs["json"] = it.body
                resp = await client.request(m, f"{base}{it.path}", **kwargs)
                results.append(
                    {"id": it.id, "ok": resp.status_code < 400, "status": resp.status_code}
                )
            except Exception as e:
                results.append({"id": it.id, "ok": False, "error": str(e)})
    return {"results": results}
