from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ParseStatus, SourceType


class SourceAssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    brand_id: uuid.UUID
    uploaded_by: uuid.UUID | None
    source_type: SourceType
    original_filename: str
    storage_key: str
    source_file_hash: str
    size_bytes: int
    has_editable_layers: bool
    file_metadata: dict = Field(default_factory=dict)
    tags: list = Field(default_factory=list)
    parse_status: ParseStatus
    parse_error: str | None
    created_at: datetime


class SourceAssetListItem(SourceAssetOut):
    pass
