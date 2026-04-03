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

router = APIRouter()


class SignupBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)


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

    model_config = {"from_attributes": True}


@router.post("/signup", response_model=TokenResponse)
async def signup(body: SignupBody):
    email = body.email.lower().strip()
    existing = await prisma.user.find_unique(where={"email": email})
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")
    user = await prisma.user.create(
        data={
            "name": body.name.strip(),
            "email": email,
            "password_hash": hash_password(body.password),
        }
    )
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


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    done = await user_has_completed_onboarding(user.id)
    return UserOut(id=user.id, name=user.name, email=user.email, onboarding_completed=done)
