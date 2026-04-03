"""Voice/text assistant — routes queries to financial engines."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from pydantic import BaseModel, Field

from services.assistant_service import run_assistant

router = APIRouter()


class AssistantQueryBody(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)


class AssistantQueryResponse(BaseModel):
    response: str
    intent: str
    data: dict = Field(default_factory=dict)


@router.post("/query", response_model=AssistantQueryResponse)
def post_assistant_query(
    body: AssistantQueryBody,
    initial_balance: float = Query(10_000.0, ge=0.0),
    horizon_days: int | None = Query(None, ge=5, le=120),
):
    """
    Intent classification → simulation / cash / decision outputs → natural language answer.
    """
    try:
        out = run_assistant(
            body.query,
            initial_balance=initial_balance,
            horizon_days=horizon_days,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return AssistantQueryResponse(
        response=out["response"],
        intent=out["intent"],
        data=out.get("data") or {},
    )
