"""Parser interfaces shared across PSD / image / video sources.

A parser decomposes a source asset into candidate Localizable Units (LUs) and
returns structural metadata for later reassembly. Parsers never write to the DB
directly — the `parse` service layer persists the result.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from app.models.enums import (
    ComplianceElementType,
    LUType,
    SemanticRole,
)


class ParserError(RuntimeError):
    pass


@dataclass
class SourceLocation:
    type: Literal["psd_layer", "image_region", "video_region", "metadata"]
    # one of the following is populated per type
    psd_layer_id: str | None = None
    bbox: tuple[int, int, int, int] | None = None  # x, y, w, h
    time_range: tuple[float, float] | None = None
    field_name: str | None = None
    font_info: dict | None = None
    style_info: dict | None = None
    mask_key: str | None = None  # storage key for mask asset, when applicable


@dataclass
class LUCandidate:
    lu_type: LUType
    source_content: dict
    source_location: SourceLocation
    semantic_role: SemanticRole | None = None
    is_locked: bool = False
    max_length_constraint: int | None = None
    parser_confidence: float | None = None
    detection_metadata: dict = field(default_factory=dict)


@dataclass
class ComplianceUnitCandidate:
    element_type: ComplianceElementType
    market_content: dict
    placement_strategy: str = "user_choosable_within_constraints"


@dataclass
class ParsedResult:
    parse_method: str
    parse_model_used: str | None
    parse_confidence: float | None
    parse_warnings: list[str]
    structural_metadata: dict
    lus: list[LUCandidate]
    compliance_candidates: list[ComplianceUnitCandidate] = field(default_factory=list)
    parse_duration_ms: int | None = None
