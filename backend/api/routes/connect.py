"""Simulated Paytm OAuth connection."""

from __future__ import annotations

import secrets

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth.deps import get_current_user
from prisma.models import User
from services import state_store

router = APIRouter()


class PaytmConnectResponse(BaseModel):
    status: str
    account: str


@router.post("/paytm", response_model=PaytmConnectResponse)
def connect_paytm(user: User = Depends(get_current_user)):
    """Simulated OAuth success; stores merchant id for this user."""
    account = f"merchant_{secrets.token_hex(4)}"
    state_store.set_paytm_connected(user.id, account)
    return PaytmConnectResponse(status="connected", account=account)
