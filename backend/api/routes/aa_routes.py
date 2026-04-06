"""Account Aggregator (Setu) – consent, callback, status."""

from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from auth.deps import get_current_user
from db.prisma_client import prisma
from integrations.account_aggregator import create_consent_request, fetch_fi_data, parse_aa_transactions
from prisma.fields import Json
from prisma.models import User
from services.aa_ingest import ingest_aa_transactions_for_user

router = APIRouter()


class AAInitiateBody(BaseModel):
    mobile: str | None = Field(None, description="10-digit India mobile; defaults to profile whatsapp_number")


class AAInitiateResponse(BaseModel):
    consent_id: str
    redirect_url: str
    mock: bool = False


class AAStatusResponse(BaseModel):
    consent_id: str | None = None
    status: str | None = None
    mobile: str | None = None
    has_linked_data: bool = False


def _public_api_base() -> str:
    return (os.getenv("PUBLIC_API_URL") or "http://localhost:8000").strip().rstrip("/")


def _public_app_base() -> str:
    return (os.getenv("PUBLIC_APP_URL") or "http://localhost:5173").strip().rstrip("/")


@router.post("/initiate", response_model=AAInitiateResponse)
async def aa_initiate(body: AAInitiateBody, user: User = Depends(get_current_user)):
    """
    Create a Setu AA consent and return the redirect URL (open in a new tab / WebView).
    """
    mobile = (body.mobile or "").strip() or (getattr(user, "whatsapp_number", None) or "")
    if not mobile or len("".join(c for c in mobile if c.isdigit())) < 10:
        raise HTTPException(
            status_code=422,
            detail="Provide `mobile` or save whatsapp_number on your profile (10 digits).",
        )

    callback_url = f"{_public_api_base()}/aa/callback"
    out = create_consent_request(user.id, mobile, callback_url)
    if out.get("error"):
        raise HTTPException(status_code=502, detail=str(out["error"]))

    consent_id = str(out["consent_id"])
    await prisma.aaconsent.create(
        data={
            "user_id": user.id,
            "consent_id": consent_id,
            "status": "PENDING",
            "mobile": "".join(c for c in mobile if c.isdigit())[-10:],
        }
    )

    return AAInitiateResponse(
        consent_id=consent_id,
        redirect_url=str(out["redirect_url"]),
        mock=bool(out.get("mock")),
    )


@router.get("/callback")
async def aa_callback(
    consent_id: str = Query(..., description="Consent id from Setu redirect"),
    status: str | None = Query(None),
    error: str | None = Query(None),
    mock: str | None = Query(None),
):
    """
    Browser redirect target after the user approves/rejects consent at the AA app.
    Public endpoint – identification is by `consent_id` stored at initiate.
    """
    rec = await prisma.aaconsent.find_first(where={"consent_id": consent_id})
    if not rec:
        return RedirectResponse(url=f"{_public_app_base()}/profile?aa=error&reason=unknown_consent")

    if error or (status and str(status).upper() in ("FAILED", "REJECTED", "DENIED")):
        await prisma.aaconsent.update(where={"id": rec.id}, data={"status": "FAILED"})
        return RedirectResponse(url=f"{_public_app_base()}/profile?aa=failed")

    # Treat redirect as success (Setu may use different param names)
    fi = fetch_fi_data(consent_id)
    if isinstance(fi, dict) and fi.get("error") and not mock:
        await prisma.aaconsent.update(
            where={"id": rec.id},
            data={"status": "FAILED", "linked_accounts": Json({"error": fi.get("error")})},
        )
        return RedirectResponse(url=f"{_public_app_base()}/profile?aa=fi_error")

    parsed = parse_aa_transactions(fi if isinstance(fi, dict) else {})
    await ingest_aa_transactions_for_user(rec.user_id, parsed)
    await prisma.aaconsent.update(
        where={"id": rec.id},
        data={
            "status": "ACTIVE",
            "linked_accounts": Json(fi if isinstance(fi, dict) else {}),
        },
    )
    return RedirectResponse(url=f"{_public_app_base()}/profile?aa=ok")


@router.get("/status", response_model=AAStatusResponse)
async def aa_status(user: User = Depends(get_current_user)):
    """Latest AA consent for the current user."""
    row = await prisma.aaconsent.find_first(
        where={"user_id": user.id},
        order={"created_at": "desc"},
    )
    if not row:
        return AAStatusResponse()
    return AAStatusResponse(
        consent_id=row.consent_id,
        status=row.status,
        mobile=row.mobile,
        has_linked_data=bool(row.linked_accounts),
    )
