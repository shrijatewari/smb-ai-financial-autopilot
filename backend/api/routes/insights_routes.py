"""Payables / supplier-side insights."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from auth.deps import get_current_user
from prisma.models import User
from services.supplier_insights import supplier_payables_summary

router = APIRouter()


@router.get("/suppliers")
async def get_supplier_insights(user: User = Depends(get_current_user)):
    return await supplier_payables_summary(user.id)
