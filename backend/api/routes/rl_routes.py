"""RL feedback + UI interaction hooks (Q-learning + module personalization)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from auth.deps import get_current_user
from prisma.models import User
from services import rl_engine

user_router = APIRouter()
rl_router = APIRouter()


class RlFeedbackBody(BaseModel):
    reward: float = Field(..., ge=-2.0, le=2.0)
    next_state_key: str | None = Field(
        None,
        description="Optional discretized next state; defaults to last transition",
    )


@rl_router.post("/feedback")
def post_rl_feedback(body: RlFeedbackBody, user: User = Depends(get_current_user)):
    """Apply a Q-learning update using the last engine transition (after pipeline tick)."""
    _ = user
    return rl_engine.apply_reward_from_feedback(body.reward, body.next_state_key)


class UserInteractionBody(BaseModel):
    event: str = Field(
        ...,
        description="dismiss_action | module_click | alert_view (execute rewards via POST /execute/action)",
    )
    action: str | None = None
    module: str | None = None


@user_router.post("/interaction")
def post_user_interaction(body: UserInteractionBody, user: User = Depends(get_current_user)):
    """
    Map product events to rewards / module weights (self-learning UI + policy).

    - execute_action → positive reward for last RL transition
    - dismiss_action → negative reward
    - module_click → bump module priority weight for this user
    """
    ev = (body.event or "").lower().strip()
    if ev == "dismiss_action":
        out = rl_engine.apply_reward_from_feedback(-0.25)
        return {"ok": True, "rl": out}
    if ev == "module_click" and body.module:
        w = rl_engine.bump_module_weight(user.id, body.module, 0.08)
        return {"ok": True, "module_weights": w}
    if ev == "alert_view":
        rl_engine.apply_reward_from_feedback(0.05)
        return {"ok": True, "rl": "nudge"}
    return {"ok": False, "detail": "unknown_event"}


@rl_router.get("/debug")
def get_rl_debug(user: User = Depends(get_current_user)):
    """Last transition for demos (authenticated)."""
    _ = user
    return {
        "last_transition": rl_engine.get_last_transition(),
        "epsilon": rl_engine.get_epsilon(),
    }
