from __future__ import annotations

from datetime import date

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import Market, OperationalStatus, SubMarketHandler


class SubMarketOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    parent_market: Market
    handler: SubMarketHandler
    display_name: str
    region_code: str | None
    operational_status: OperationalStatus
    legalization_date: date | None
    last_reviewed_at: date | None
    regulatory_body: str | None
    law_reference: str | None
    min_age: int | None
    license_number_format: str | None
    rg_hotline: str | None
    rg_logo_url: str | None
    mandatory_disclaimers: list = Field(default_factory=list)
    content_language: str | None
    currency: str | None
    prompt_overrides: dict = Field(default_factory=dict)
    notes: str | None


class SubMarketUpdate(BaseModel):
    """System-admin-only fields for maintaining sub-market regulatory state."""

    operational_status: OperationalStatus | None = None
    last_reviewed_at: date | None = None
    regulatory_body: str | None = None
    law_reference: str | None = None
    min_age: int | None = Field(default=None, ge=16, le=25)
    license_number_format: str | None = None
    rg_hotline: str | None = None
    rg_logo_url: str | None = None
    mandatory_disclaimers: list | None = None
    prompt_overrides: dict | None = None
    notes: str | None = None
