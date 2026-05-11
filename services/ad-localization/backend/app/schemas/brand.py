from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, Field


class BrandRestrictions(BaseModel):
    forbidden_elements: list[dict] = Field(default_factory=list)
    forbidden_themes: list[str] = Field(default_factory=list)
    competitor_brands: list[str] = Field(default_factory=list)
    market_specific_restrictions: dict = Field(default_factory=dict)


class BrandVoice(BaseModel):
    attributes: list[str] = Field(default_factory=list)
    personality_description: str = ""
    voice_dos: list[str] = Field(default_factory=list)
    voice_donts: list[str] = Field(default_factory=list)
    prohibited_phrases: list[str] = Field(default_factory=list)


class BrandBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    slug: str = Field(min_length=1, max_length=100, pattern=r"^[a-z0-9][a-z0-9-]*$")
    display_name_by_market: dict[str, str] = Field(default_factory=dict)
    restrictions: BrandRestrictions = Field(default_factory=BrandRestrictions)
    voice: BrandVoice = Field(default_factory=BrandVoice)
    lock_brand_name: bool = True
    prompt_additions: str = Field(default="", max_length=4000)


class BrandCreate(BrandBase):
    pass


class BrandUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    display_name_by_market: dict[str, str] | None = None
    restrictions: BrandRestrictions | None = None
    voice: BrandVoice | None = None
    lock_brand_name: bool | None = None
    prompt_additions: str | None = Field(default=None, max_length=4000)
    is_active: bool | None = None


class BrandOut(BrandBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    version: int
    is_active: bool
