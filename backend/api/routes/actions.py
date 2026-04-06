"""Decision recommendations and simulated execution."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth.deps import get_current_user_optional
from db.prisma_client import prisma
from models.action import ExecuteActionRequest, ExecuteActionResponse
from prisma.models import User
from services.call_agent import simulate_call
from services.execution_service import create_razorpay_payment_link, execute_collect_payment
from services.financial_pipeline import run_full_pipeline
from services import rl_engine
from services.voice_call_service import make_call as twilio_make_call
from services.bill_service import bill_to_message_parts
from services.whatsapp_service import (
    build_khaata_bill_proof_message,
    generate_payment_message,
    send_whatsapp_message,
    try_send_bill_attachment,
)

router_decision = APIRouter()
router_execute = APIRouter()


class PaymentLinkRequest(BaseModel):
    amount: float = Field(..., gt=0, le=1_000_000_000)
    customer_name: str = Field(..., min_length=1, max_length=120)
    phone: str = Field(..., min_length=8, max_length=20)
    email: str | None = Field(None, max_length=120)
    description: str | None = Field(
        None,
        max_length=255,
        description="Razorpay payment link description (e.g. Payment to ShopName - outstanding dues).",
    )
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
    customer_id: int | None = Field(
        None,
        ge=1,
        description="With JWT auth: load linked bill proof from Customer row when set.",
    )
    shop_name: str | None = Field(None, max_length=200, description="Override shop label in message + Razorpay description.")
    customer_email: str | None = Field(None, max_length=120, description="Optional – Razorpay customer email + notify.")


class WhatsappExecuteResponse(BaseModel):
    status: str
    message: str
    phone: str
    preview: str | None = None
    payment_link: str | None = None
    payment_link_mock: bool = True
    razorpay_id: str | None = None


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
        description=body.description,
    )
    return PaymentLinkResponse(
        payment_link=out.get("payment_link"),
        status=str(out.get("status") or "created"),
        id=out.get("id"),
        mock=bool(out.get("mock", True)),
        note=out.get("note"),
        fallback_reason=out.get("fallback_reason"),
    )


async def _resolve_shop_name(user: User | None, override: str | None) -> str:
    o = (override or "").strip()
    if o:
        return o[:120]
    if user is not None:
        bp = await prisma.businessprofile.find_first(where={"user_id": user.id})
        if bp and (bp.business_type or "").strip():
            return str(bp.business_type).strip()[:120]
        if (user.name or "").strip():
            return str(user.name).strip()[:120]
    return "Dukaan"


async def _run_whatsapp_reminder_with_payment_link(
    body: WhatsappExecuteBody,
    user: User | None,
) -> tuple[str, dict[str, Any], dict[str, Any], str | None]:
    """
    Builds Razorpay link + reminder text, sends WhatsApp. Returns (preview_text, rzp, sent, bill_parts_or_none).
    """
    tone = (body.tone or "formal").lower().strip()
    if tone not in ("friendly", "formal"):
        raise HTTPException(status_code=422, detail="tone must be 'friendly' or 'formal'")

    if body.customer_id is not None and user is None:
        raise HTTPException(status_code=401, detail="customer_id requires authentication")

    phone_digits = "".join(c for c in body.phone if c.isdigit())
    if len(phone_digits) < 8:
        raise HTTPException(status_code=422, detail="Invalid phone number")

    shop = await _resolve_shop_name(user, body.shop_name)
    notes = None
    if user is not None and body.customer_id is not None:
        notes = {"user_id": str(user.id), "customer_id": str(body.customer_id)}

    rzp_desc = f"Payment to {shop} - outstanding dues"
    rzp = create_razorpay_payment_link(
        amount_inr=float(body.amount),
        customer_name=body.customer[:120],
        phone=phone_digits[-10:],
        email=body.customer_email,
        notes=notes,
        description=rzp_desc,
    )
    pay_link = rzp.get("payment_link") or f"https://paytm.com/pay?amount={int(round(body.amount))}"

    text: str
    bill_parts = None
    if user is not None and body.customer_id is not None:
        cust = await prisma.customer.find_first(
            where={"id": body.customer_id, "user_id": user.id},
        )
        if cust and cust.bill_id:
            bill_parts = await bill_to_message_parts(user.id, cust.bill_id)
        if bill_parts:
            text = build_khaata_bill_proof_message(
                shop,
                str(cust.name if cust else body.customer),
                float(body.amount),
                bill_parts,
                pay_link,
            )
        else:
            text = generate_payment_message(
                body.customer,
                float(body.amount),
                tone=tone,
                payment_link=pay_link,
                shop_name=shop,
            )
    else:
        text = generate_payment_message(
            body.customer,
            float(body.amount),
            tone=tone,
            payment_link=pay_link,
            shop_name=shop,
        )

    sent = send_whatsapp_message(phone_digits, text)
    if sent.get("status") == "error":
        raise HTTPException(
            status_code=502,
            detail=str(sent.get("detail") or "WhatsApp send failed"),
        )

    if bill_parts and str(bill_parts.get("source") or "") == "ocr" and bill_parts.get("file_path"):
        try:
            try_send_bill_attachment(
                phone_digits,
                str(bill_parts.get("file_path")),
                caption="Aapke bill ki photocopy / scan.",
            )
        except Exception:
            pass

    return text, rzp, sent, bill_parts


@router_execute.post("/whatsapp", response_model=WhatsappExecuteResponse)
async def post_whatsapp_reminder(
    body: WhatsappExecuteBody,
    user: User | None = Depends(get_current_user_optional),
):
    """
    Generate a payment reminder (friendly or formal) and send via WhatsApp (Meta or mock).
    Embeds a Razorpay payment link (live when keys are set; else docs URL – fake rzp.io IDs are invalid).
    When `customer_id` + JWT: optional bill proof + attachment.
    """
    text, rzp, sent, _bill = await _run_whatsapp_reminder_with_payment_link(body, user)
    rl_engine.apply_reward_from_feedback(0.42)

    short_name = body.customer.split("(")[0].split(",")[0].strip() or body.customer
    via = "Meta WhatsApp API" if not sent.get("mock") else "simulated (set WHATSAPP_* in .env for live send)"
    return WhatsappExecuteResponse(
        status=str(sent.get("status") or "sent"),
        message=f"Reminder sent to {short_name} ({via})",
        phone=str(sent.get("phone") or "".join(c for c in body.phone if c.isdigit())),
        preview=text,
        payment_link=rzp.get("payment_link"),
        payment_link_mock=bool(rzp.get("mock", True)),
        razorpay_id=rzp.get("id"),
    )


@router_execute.post("/collect", response_model=WhatsappExecuteResponse)
async def post_execute_collect(
    body: WhatsappExecuteBody,
    user: User | None = Depends(get_current_user_optional),
):
    """
    Single call: generate Razorpay payment link for the outstanding amount + send WhatsApp with link embedded.
    Same request body as POST /execute/whatsapp; response includes payment_link for UI copy/share.
    """
    text, rzp, sent, _bill = await _run_whatsapp_reminder_with_payment_link(body, user)
    rl_engine.apply_reward_from_feedback(0.45)

    short_name = body.customer.split("(")[0].split(",")[0].strip() or body.customer
    via = "Meta WhatsApp API" if not sent.get("mock") else "simulated (set WHATSAPP_* in .env for live send)"
    return WhatsappExecuteResponse(
        status=str(sent.get("status") or "sent"),
        message=f"Collect link + WhatsApp to {short_name} ({via})",
        phone=str(sent.get("phone") or "".join(c for c in body.phone if c.isdigit())),
        preview=text,
        payment_link=rzp.get("payment_link"),
        payment_link_mock=bool(rzp.get("mock", True)),
        razorpay_id=rzp.get("id"),
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
