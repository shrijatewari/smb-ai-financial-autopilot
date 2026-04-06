"""JWT authentication: signup, login, current user."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from auth.jwt_tokens import create_access_token
from auth.password import hash_password, verify_password
from auth.deps import get_current_user
from db.prisma_client import prisma
from prisma.models import User
from services.onboarding_persistence import user_has_completed_onboarding
from services.referral_codes import ensure_referral_code

router = APIRouter()


class SignupBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    referral_code: str | None = Field(None, description="Optional invite code from another user")


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    onboarding_completed: bool = False
    """At least one document uploaded (invoice/GST/bank export) – required before business form."""
    documents_uploaded: bool = False
    trusted_helper_phone: str | None = None
    helper_approval_required: bool = False
    """Assistant / voice / bot replies: Hindi or English."""
    conversation_language: str = "hi"
    whatsapp_number: str | None = None
    morning_briefing_enabled: bool = False
    subscription_tier: str = "free"
    referral_code: str | None = None

    model_config = {"from_attributes": True}


class UserPatchBody(BaseModel):
    trusted_helper_phone: str | None = None
    helper_approval_required: bool | None = None
    conversation_language: str | None = Field(
        None,
        description="hi | en – assistant and voice conversation language",
    )
    whatsapp_number: str | None = Field(None, description="10-digit India or international – for WhatsApp briefings")
    morning_briefing_enabled: bool | None = None


def _normalize_helper_phone(raw: str | None) -> str | None:
    if raw is None:
        return None
    s = "".join(c for c in raw.strip() if c.isdigit())
    if not s:
        return None
    if len(s) == 11 and s.startswith("0"):
        s = s[1:]
    if len(s) == 12 and s.startswith("91"):
        s = s[-10:]
    if len(s) != 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Helper phone must be 10 digits (India).",
        )
    return s


@router.post("/signup", response_model=TokenResponse)
async def signup(body: SignupBody):
    email = body.email.lower().strip()
    existing = await prisma.user.find_unique(where={"email": email})
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    referred_by_id: int | None = None
    if body.referral_code and str(body.referral_code).strip():
        code = str(body.referral_code).strip().upper()
        inviter = await prisma.user.find_first(where={"referral_code": code})
        if inviter:
            referred_by_id = inviter.id
    user = await prisma.user.create(
        data={
            "name": body.name.strip(),
            "email": email,
            "password_hash": hash_password(body.password),
            "referred_by_user_id": referred_by_id,
        }
    )
    await ensure_referral_code(user.id)
    if referred_by_id is not None:
        try:
            await prisma.referralevent.create(
                data={
                    "referrer_id": referred_by_id,
                    "referee_user_id": user.id,
                }
            )
        except Exception:
            pass
    token = create_access_token(user.id, {"email": user.email})
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginBody):
    email = body.email.lower().strip()
    user = await prisma.user.find_unique(where={"email": email})
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    token = create_access_token(user.id, {"email": user.email})
    return TokenResponse(access_token=token)


async def _user_out(user: User) -> UserOut:
    done = await user_has_completed_onboarding(user.id)
    doc_count = await prisma.documentrecord.count(where={"user_id": user.id})
    ref_code = getattr(user, "referral_code", None)
    if not ref_code:
        ref_code = await ensure_referral_code(user.id)
    return UserOut(
        id=user.id,
        name=user.name,
        email=user.email,
        onboarding_completed=done,
        documents_uploaded=doc_count > 0,
        trusted_helper_phone=getattr(user, "trusted_helper_phone", None),
        helper_approval_required=bool(getattr(user, "helper_approval_required", False)),
        conversation_language=getattr(user, "conversation_language", None) or "hi",
        whatsapp_number=getattr(user, "whatsapp_number", None),
        morning_briefing_enabled=bool(getattr(user, "morning_briefing_enabled", False)),
        subscription_tier=getattr(user, "subscription_tier", None) or "free",
        referral_code=str(ref_code) if ref_code else None,
    )


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return await _user_out(user)


def _normalize_whatsapp_number(raw: str | None) -> str | None:
    if raw is None:
        return None
    s = "".join(c for c in raw.strip() if c.isdigit())
    if not s:
        return None
    if len(s) == 11 and s.startswith("0"):
        s = s[1:]
    if len(s) == 12 and s.startswith("91"):
        s = s[-10:]
    if len(s) == 10:
        return s
    if len(s) >= 8:
        return s
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="WhatsApp number must be 10 digits (India) or a valid international number.",
    )


def _normalize_conversation_language(raw: str | None) -> str:
    if raw is None:
        return "hi"
    s = raw.strip().lower()
    if s not in ("hi", "en"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="conversation_language must be 'hi' or 'en'.",
        )
    return s


@router.patch("/me", response_model=UserOut)
async def patch_me(body: UserPatchBody, user: User = Depends(get_current_user)):
    data: dict = {}
    if body.trusted_helper_phone is not None:
        data["trusted_helper_phone"] = _normalize_helper_phone(body.trusted_helper_phone)
    if body.helper_approval_required is not None:
        data["helper_approval_required"] = body.helper_approval_required
    if body.conversation_language is not None:
        data["conversation_language"] = _normalize_conversation_language(body.conversation_language)
    if body.whatsapp_number is not None:
        data["whatsapp_number"] = _normalize_whatsapp_number(body.whatsapp_number)
    if body.morning_briefing_enabled is not None:
        data["morning_briefing_enabled"] = body.morning_briefing_enabled
    if data:
        user = await prisma.user.update(where={"id": user.id}, data=data)
    return await _user_out(user)
