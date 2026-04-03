"""User identity model (API + future ORM mapping)."""

from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field


class User(BaseModel):
    """Authenticated principal for multi-tenant isolation (in-memory demo maps one user)."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    external_ref: str | None = None
    email: str | None = None
    organization_name: str | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: dict[str, Any] = Field(default_factory=dict)

    model_config = {"extra": "ignore"}
