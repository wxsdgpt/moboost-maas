from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PromptOverrideOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    use_case: str
    market: str
    mode: str
    content: str
    notes: str
    is_active: bool
    updated_at: datetime


class PromptOverrideUpsert(BaseModel):
    use_case: str = Field(min_length=1, max_length=50)
    market: str = Field(default="", max_length=16)
    mode: str = Field(default="", pattern=r"^$|^(language|compliance|element_replace)$")
    content: str = Field(default="", max_length=8000)
    notes: str = Field(default="", max_length=500)
    is_active: bool = True


class AssemblyPreviewIn(BaseModel):
    use_case: str
    market: str
    sub_market: str | None = None
    modes: list[str] = Field(default_factory=lambda: ["language"])
    brand_id: uuid.UUID | None = None
    campaign_id: uuid.UUID | None = None


class AssemblyPreviewOut(BaseModel):
    system_prompt: str
    user_prompt: str
    negative_prompt: str | None
    token_estimate: int
    layers: list[dict]
    overrides_applied: list[dict]
