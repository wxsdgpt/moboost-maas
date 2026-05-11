"""Use cases per PROMPT_ASSEMBLY.md §"Use Case → Layer Composition"."""

from __future__ import annotations

import enum


class UseCase(str, enum.Enum):
    # Parsing
    SOURCE_ASSET_PARSE = "source_parse"

    # Text localization
    TEXT_LITERAL_TRANSLATE = "text_literal"
    TEXT_LIGHT_LOCALIZE = "text_light"
    TEXT_TRANSCREATE = "text_transcreate"

    # Image editing (Nano Banana)
    IMAGE_TEXT_REPLACE = "image_text_replace"
    IMAGE_ELEMENT_REPLACE = "image_element_replace"
    IMAGE_ELEMENT_REMOVE = "image_element_remove"

    # Video editing (per-frame Nano Banana + Veo 3.1 / Kling)
    VIDEO_TEXT_REPLACE = "video_text_replace"
    VIDEO_ELEMENT_REPLACE = "video_element_replace"
    VIDEO_AUDIO_REPLACE = "video_audio_replace"

    # Compliance (multimodal LLM + LLM)
    COMPLIANCE_VISION_CHECK = "compliance_vision"
    COMPLIANCE_EXPLANATION = "compliance_explain"

    # Second-opinion review after the primary generator
    TRANSLATION_REVIEW = "translation_review"
    IMAGE_EDIT_REVIEW = "image_edit_review"

    # Utility
    ASSET_TAGGING = "asset_tagging"


# Temperature defaults — Prompt Assembly forces these into final output unless overridden.
TEMPERATURE_BY_USE_CASE: dict[UseCase, float] = {
    UseCase.TEXT_LITERAL_TRANSLATE: 0.0,
    UseCase.TEXT_LIGHT_LOCALIZE: 0.3,
    UseCase.TEXT_TRANSCREATE: 0.7,
    UseCase.COMPLIANCE_VISION_CHECK: 0.0,
    UseCase.SOURCE_ASSET_PARSE: 0.0,
    UseCase.COMPLIANCE_EXPLANATION: 0.2,
    UseCase.TRANSLATION_REVIEW: 0.0,
    UseCase.IMAGE_EDIT_REVIEW: 0.0,
}
