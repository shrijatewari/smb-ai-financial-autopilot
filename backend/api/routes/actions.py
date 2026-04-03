"""Decision recommendations and simulated execution."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth.deps import get_current_user_optional
from models.action import ExecuteActionRequest, ExecuteActionResponse
from prisma.models import User
from services.call_agent import simulate_call
from services.execution_service import create_razorpay_payment_link, execute_collect_payment
from services.financial_pipeline import run_full_pipeline
from services import rl_engine
from services.voice_call_service import make_call as twilio_make_call
from services.whatsapp_service import generate_payment_message, send_whatsapp_message

router_decision = APIRouter()
router_execute = APIRouter()


class PaymentLinkRequest(BaseModel):
    amount: float = Field(..., gt=0, le=1_000_000_000)
    customer_name: str = Field(..., min_length=1, max_length=120)
    phone: str = Field(..., min_length=8, max_length=20)
    email: str | None = Field(None, max_length=120)
    customer_id: int | None = Field(
        None,
        ge=1,
        description="With JWT auth, embedded in Razorpay notes for webhook settlement matching.",
    )


class PaymentLinkResponse(BaseModel):
    payment_link: str | None = None
    status: str
    id: str | None = None
    mock: bool = True
    note: str | None = None
    fallback_reason: str | None = None

    model_config = {"extra": "ignore"}


class WhatsappExecuteBody(BaseModel):
    customer: str = Field(..., min_length=1, max_length=200)
    phone: str = Field(..., min_length=8, max_length=20)
    amount: float = Field(..., gt=0, le=1_000_000_000)
    tone: str = Field("formal", description="friendly | formal")


class WhatsappExecuteResponse(BaseModel):
    status: str
    message: str
    phone: str
    preview: str | None = None


class CallSimulateBody(BaseModel):
    customer: str = Field(..., min_length=1, max_length=200)
    amount: float = Field(..., gt=0, le=1_000_000_000)


class CallSimulateResponse(BaseModel):
    status: str
    script: str
    likelihood: str


class TwilioCallBody(BaseModel):
    phone: str = Field(..., min_length=8, max_length=20)
    text: str = Field(..., min_length=1, max_length=2000)


class TwilioCallResponse(BaseModel):
    status: str
    mock: bool = True
    detail: str | None = None
    to: str | None = None
    sid: str | None = None
    preview: str | None = None


@router_decision.get("")
def get_decision(
    initial_balance: float = Query(10_000.0, ge=0.0),
    horizon_days: int = Query(30, ge=5, le=120),
):
    """Return prioritized automated financial actions."""
    try:
        out = run_full_pipeline(initial_balance=initial_balance, horizon_days=horizon_days)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    return {
        "actions": out["actions"],
        "risk_explanation": out["risk_explanation"],
        "credit": out["credit"],
        "simulation": {
            "probability_of_negative_cash": out["simulation"]["probability_of_negative_cash"],
            "worst_case_cash": out["simulation"]["worst_case_cash"],
        },
    }


@router_execute.post("/payment-link", response_model=PaymentLinkResponse)
async def post_razorpay_payment_link(
    body: PaymentLinkRequest,
    user: User | None = Depends(get_current_user_optional),
):
    """
    Create a Razorpay payment link (live API when `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` are set).

    Falls back to a structured mock (`mock: true`) with the same response shape.
    If the caller is authenticated and passes `customer_id`, notes are attached for webhook settlement.
    """
    notes = None
    if user is not None and body.customer_id is not None:
        notes = {"user_id": str(user.id), "customer_id": str(body.customer_id)}
    out = create_razorpay_payment_link(
        amount_inr=body.amount,
        customer_name=body.customer_name,
        phone=body.phone,
        email=body.email,
        notes=notes,
    )
    return PaymentLinkResponse(
        payment_link=out.get("payment_link"),
        status=str(out.get("status") or "created"),
        id=out.get("id"),
        mock=bool(out.get("mock", True)),
        note=out.get("note"),
        fallback_reason=out.get("fallback_reason"),
    )


@router_execute.post("/whatsapp", response_model=WhatsappExecuteResponse)
def post_whatsapp_reminder(body: WhatsappExecuteBody):
    """
    Generate a payment reminder (friendly or formal) and simulate WhatsApp delivery.
    Embeds a real Razorpay link when keys are configured; otherwise a Paytm-style demo URL.
    """
    tone = (body.tone or "formal").lower().strip()
    if tone not in ("friendly", "formal"):
        raise HTTPException(status_code=422, detail="tone must be 'friendly' or 'formal'")

    phone_digits = "".join(c for c in body.phone if c.isdigit())
    if len(phone_digits) < 8:
        raise HTTPException(status_code=422, detail="Invalid phone number")

    rzp = create_razorpay_payment_link(
        amount_inr=float(body.amount),
        customer_name=body.customer[:120],
        phone=phone_digits[-10:],
        email=None,
    )
    pay_link = rzp.get("payment_link") or f"https://paytm.com/pay?amount={int(round(body.amount))}"

    text = generate_payment_message(
        body.customer,
        float(body.amount),
        tone=tone,
        payment_link=pay_link,
    )
    sent = send_whatsapp_message(phone_digits, text)
    if sent.get("status") == "error":
        raise HTTPException(
            status_code=502,
            detail=str(sent.get("detail") or "WhatsApp send failed"),
        )
    rl_engine.apply_reward_from_feedback(0.42)

    short_name = body.customer.split("(")[0].split(",")[0].strip() or body.customer
    via = "Meta WhatsApp API" if not sent.get("mock") else "simulated (set WHATSAPP_* in .env for live send)"
    return WhatsappExecuteResponse(
        status=str(sent.get("status") or "sent"),
        message=f"Reminder sent to {short_name} ({via})",
        phone=str(sent.get("phone") or phone_digits),
        preview=text,
    )


@router_execute.post("/call", response_model=CallSimulateResponse)
def post_call_simulation(body: CallSimulateBody):
    """Simulated AI call script + payment likelihood (demo)."""
    out = simulate_call(body.customer, float(body.amount))
    rl_engine.apply_reward_from_feedback(0.44)
    return CallSimulateResponse(
        status=str(out["status"]),
        script=str(out["script"]),
        likelihood=str(out["likelihood"]),
    )


@router_execute.post("/twilio-call", response_model=TwilioCallResponse)
def post_twilio_voice_call(body: TwilioCallBody):
    """
    Real outbound call via Twilio + Hindi TTS (when TWILIO_* env vars are set).
    Otherwise returns mock status with the script preview.
    """
    out = twilio_make_call(body.phone, body.text)
    if out.get("status") == "error":
        raise HTTPException(status_code=502, detail=out.get("detail") or "Call failed")
    rl_engine.apply_reward_from_feedback(0.4)
    return TwilioCallResponse(
        status=str(out.get("status") or "queued"),
        mock=bool(out.get("mock", True)),
        detail=out.get("detail"),
        to=out.get("to"),
        sid=out.get("sid"),
        preview=out.get("preview"),
    )


@router_execute.post("/action", response_model=ExecuteActionResponse)
def post_execute_action(body: ExecuteActionRequest):
    """Simulate Paytm-style execution for collect_payment and related actions."""
    act = (body.action or "").lower().strip()
    if act == "collect_payment":
        if not body.customer or body.amount is None:
            raise HTTPException(status_code=422, detail="collect_payment requires customer and amount")
        res = execute_collect_payment(body.amount, body.customer)
        rl_engine.apply_reward_from_feedback(0.5)
        return ExecuteActionResponse(
            status=res["status"],
            message=res["message"],
            payment_link=res["payment_link"],
            correlation_id=res["correlation_id"],
        )
    if act in ("reduce_expense", "offer_credit_line", "delay_payable", "notify"):
        rl_engine.apply_reward_from_feedback(0.35)
        return ExecuteActionResponse(
            status="queued",
            message=f"Action '{act}' recorded for treasury workflow integration.",
            payment_link=None,
            correlation_id=body.reference or "internal-queue",
        )
    raise HTTPException(status_code=400, detail="Unsupported action type")
