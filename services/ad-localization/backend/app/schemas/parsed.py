from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import LUType, SemanticRole


class LUOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    lu_type: LUType
    source_content: dict = Field(default_factory=dict)
    source_location: dict = Field(default_factory=dict)
    semantic_role: SemanticRole | None
    default_strategy: str | None
    is_locked: bool
    max_length_constraint: int | None
    parser_confidence: float | None
    detection_metadata: dict = Field(default_factory=dict)


class ParsedAssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    source_asset_id: uuid.UUID
    parse_method: str
    parse_model_used: str | None
    parse_confidence: float | None
    parse_warnings: list[str] = Field(default_factory=list)
    structural_metadata: dict = Field(default_factory=dict)
    parse_duration_ms: int | None
    parsed_at: datetime | None


class ParsedAssetDetail(ParsedAssetOut):
    localizable_units: list[LUOut] = Field(default_factory=list)
