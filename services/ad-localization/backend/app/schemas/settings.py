from __future__ import annotations

from pydantic import BaseModel, Field


class SettingOut(BaseModel):
    key: str
    category: str
    description: str | None
    value_masked: str
    has_value: bool
    source: str


class SettingUpdate(BaseModel):
    value: str = Field(min_length=0, max_length=2000)
