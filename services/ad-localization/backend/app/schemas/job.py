from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import JobStatus, Market


class LocalizationTargetIn(BaseModel):
    market: Market
    sub_market: str | None = None  # e.g. "US-NJ", "NG-LA"


class JobCreate(BaseModel):
    source_asset_id: uuid.UUID
    targets: list[LocalizationTargetIn] = Field(min_length=1)


class MatrixCell(BaseModel):
    strategy: str
    user_instructions: str | None = None
    user_provided_content: str | None = None


class MatrixCellUpdate(BaseModel):
    lu_id: uuid.UUID
    target: str  # composite "US", "US-NJ", "NG-LA"
    strategy: str
    user_instructions: str | None = None
    user_provided_content: str | None = None


class JobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source_asset_id: uuid.UUID
    requested_by: uuid.UUID | None
    target_markets: list = Field(default_factory=list)
    status: JobStatus
    started_at: datetime | None
    completed_at: datetime | None
    error_message: str | None
    estimated_cost_usd: Decimal | None
    actual_cost_usd: Decimal | None


class MatrixView(BaseModel):
    job_id: uuid.UUID
    targets: list[str]  # composite tags
    rows: list[dict]  # [{ lu_id, lu_type, semantic_role, preview, cells: {target: MatrixCell} }]
