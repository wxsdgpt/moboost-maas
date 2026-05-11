from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Any

from app.prompt_assembly.use_cases import UseCase


@dataclass
class ReferenceAsset:
    kind: str  # "image", "video", "audio", "psd_layer", "mask"
    storage_key: str | None = None
    mime_type: str | None = None
    metadata: dict = field(default_factory=dict)


@dataclass
class PromptContext:
    use_case: UseCase

    # Targeting
    market: str                       # "US" / "US-NJ" / "NG-LA" / ...
    sub_market: str | None = None
    target_language: str | None = None

    # Source asset context
    source_asset_id: uuid.UUID | None = None
    source_asset_hash: str | None = None
    source_lu_id: uuid.UUID | None = None
    source_content: dict | None = None            # e.g., { text, language, font_info }
    source_location: dict | None = None

    # Brand context (normalized fields to keep layers pure-data)
    brand_id: uuid.UUID | None = None
    brand_version: int | None = None
    brand_restrictions: dict | None = None
    brand_voice: dict | None = None
    brand_glossary: list[dict] | None = None

    # Market context
    market_compliance: dict | None = None         # forbidden words, required elements, ...
    market_culture: dict | None = None
    market_audio: dict | None = None

    # Strategy & user input
    strategy: str | None = None
    user_instructions: str | None = None
    user_provided_content: str | None = None

    # Image/video editing
    mask_region: dict | None = None               # {type, bbox?, polygon?, mask_key?}
    font_info: dict | None = None
    style_info: dict | None = None

    # Few-shot examples (approved historical transcreations)
    few_shot_examples: list[dict] = field(default_factory=list)

    # Reference assets the model needs attached
    reference_assets: list[ReferenceAsset] = field(default_factory=list)

    # Extra
    extra: dict[str, Any] = field(default_factory=dict)

    @property
    def target_tag(self) -> str:
        return self.sub_market or self.market
