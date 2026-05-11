from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field


class ProjectBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    tags: list[str] = Field(default_factory=list)
    prompt_additions: str = Field(default="", max_length=4000)


class ProjectCreate(ProjectBase):
    brand_id: uuid.UUID


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    tags: list[str] | None = None
    prompt_additions: str | None = Field(default=None, max_length=4000)
    is_active: bool | None = None


class ProjectOut(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    brand_id: uuid.UUID
    is_active: bool
