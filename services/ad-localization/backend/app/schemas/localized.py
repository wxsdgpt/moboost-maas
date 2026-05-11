from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import LocalizedAssetStatus, Market


class LocalizedAssetSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    localization_job_id: uuid.UUID
    source_asset_id: uuid.UUID
    target_market: Market
    target_sub_market: str | None
    status: LocalizedAssetStatus
    output_storage_key: str | None
    output_file_hash: str | None
    compliance_overlay_applied: bool
    platform_metadata: dict = Field(default_factory=dict)
    compliance_report_id: uuid.UUID | None
    confirmation_id: uuid.UUID | None
    created_at: datetime


class LocalizedAssetDetail(LocalizedAssetSummary):
    unit_outputs: list[dict] = Field(default_factory=list)
