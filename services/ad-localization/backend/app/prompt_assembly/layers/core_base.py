from __future__ import annotations

from app.prompt_assembly.base import BaseLayerImpl
from app.prompt_assembly.context import PromptContext
from app.prompt_assembly.trace import LayerContribution
from app.prompt_assembly.use_cases import TEMPERATURE_BY_USE_CASE, UseCase

_SYSTEM_BY_USE_CASE: dict[UseCase, str] = {
    UseCase.SOURCE_ASSET_PARSE: (
        "You are a structured multimodal parser for an ad-localization system. "
        "Analyze the provided image and extract ALL visible text regions with their "
        "exact pixel bounding boxes. Return strict JSON in this exact schema:\n"
        "{\n"
        '  "text_units": [\n'
        "    {\n"
        '      "content": "the exact text shown in this region",\n'
        '      "language": "en",\n'
        '      "role": "headline" | "subheadline" | "cta" | "body" | "disclaimer" | "logo_text",\n'
        '      "confidence": 0.95,\n'
        '      "location": {\n'
        '        "bbox": [x, y, width, height]\n'
        "      },\n"
        '      "font_info": {\n'
        '        "estimated_size_px": 32,\n'
        '        "weight": "bold" | "normal",\n'
        '        "color_hex": "#FFFFFF"\n'
        "      }\n"
        "    }\n"
        "  ],\n"
        '  "visual_units": [\n'
        "    {\n"
        '      "description": "brief description of the visual element",\n'
        '      "element_type": "product" | "person" | "logo" | "background" | "icon" | "prop",\n'
        '      "confidence": 0.9,\n'
        '      "location": {\n'
        '        "bbox": [x, y, width, height]\n'
        "      }\n"
        "    }\n"
        "  ]\n"
        "}\n\n"
        "CRITICAL RULES for bounding boxes:\n"
        "- bbox is [x, y, width, height] in PIXELS from the top-left corner of the image.\n"
        "- x = left edge pixel coordinate, y = top edge pixel coordinate.\n"
        "- width = horizontal span in pixels, height = vertical span in pixels.\n"
        "- The image dimensions are provided in the source content. Use those to "
        "calculate accurate pixel coordinates.\n"
        "- Every text_unit MUST have a location.bbox. Do NOT omit it.\n"
        "- Be as precise as possible — the bbox should tightly wrap the text."
    ),
    UseCase.TEXT_LITERAL_TRANSLATE: (
        "You are a faithful translator for legal / disclaimer copy in an iGaming "
        "context. Translate verbatim into the target language. Preserve numbers, "
        "odds formats, and brand/product names exactly."
    ),
    UseCase.TEXT_LIGHT_LOCALIZE: (
        "You are a localization specialist for iGaming ad copy. Translate into "
        "the target language and apply idiomatic adjustments only where strictly "
        "necessary to read naturally. Preserve meaning and any regulated terms."
    ),
    UseCase.TEXT_TRANSCREATE: (
        "You are a senior copywriter localizing iGaming ads. Produce transcreations "
        "that capture the source intent while fitting the target market's culture, "
        "tone, and regulatory norms. Stay within brand voice."
    ),
    UseCase.IMAGE_TEXT_REPLACE: (
        "You are an image-editing model. Replace only the text in the masked "
        "region. Match font, size, color, and perspective of the original text."
    ),
    UseCase.IMAGE_ELEMENT_REPLACE: (
        "You are an image-editing model. Replace only the element inside the mask "
        "with the requested replacement. Preserve composition, lighting, shadows, "
        "and everything outside the mask."
    ),
    UseCase.IMAGE_ELEMENT_REMOVE: (
        "You are an image-editing model. Remove the element inside the mask by "
        "inpainting a plausible continuation of the surrounding content. Preserve "
        "everything outside the mask."
    ),
    UseCase.VIDEO_TEXT_REPLACE: (
        "You are a per-frame video-editing model. Replace only the text in the "
        "masked region across the specified frame range. Maintain text placement, "
        "font, and motion continuity."
    ),
    UseCase.VIDEO_ELEMENT_REPLACE: (
        "You are a video-editing model. Replace only the element in the mask "
        "across the specified frame range. Preserve surrounding content."
    ),
    UseCase.VIDEO_AUDIO_REPLACE: (
        "You are a video audio-regeneration model. Replace the audio track only. "
        "Do not modify any video frame. Match lip/mouth timing where visible."
    ),
    UseCase.COMPLIANCE_VISION_CHECK: (
        "You are a compliance auditor for iGaming ads. Evaluate the supplied asset "
        "against the provided rule set. Return a structured JSON report of findings "
        "with severity levels."
    ),
    UseCase.COMPLIANCE_EXPLANATION: (
        "Explain the following compliance finding in plain English for an ad-ops "
        "reviewer: what rule was triggered, what was detected, and how to fix it."
    ),
    UseCase.ASSET_TAGGING: (
        "Return structured tags for this asset: sport, emotional tone, primary "
        "visual elements. JSON only."
    ),
    UseCase.TRANSLATION_REVIEW: (
        "You are a strict translation reviewer for iGaming localization. "
        "Evaluate the target text against the source for: meaning fidelity, "
        "market-appropriate register, brand voice adherence, compliance with "
        "the target market's forbidden words, and glossary compliance. Return "
        "JSON with fields: verdict ('pass'|'revise'|'fail'), score (0..1), "
        "issues (array of short strings), suggested_revision (string, optional)."
    ),
    UseCase.IMAGE_EDIT_REVIEW: (
        "You are a visual QA reviewer for iGaming ad localization. A source "
        "image and a post-edit image are attached. Evaluate whether the edit "
        "respects the mask (only intended region changed), preserves lighting "
        "and composition elsewhere, and produces a compliant result for the "
        "target market. Return JSON with verdict, score (0..1), issues, "
        "suggested_retry (optional)."
    ),
}


class BaseLayer(BaseLayerImpl):
    name = "BaseLayer"
    version = "1"
    priority = 10
    applies_to = tuple(UseCase)
    non_truncatable = True

    def apply(self, context: PromptContext) -> LayerContribution:
        system = _SYSTEM_BY_USE_CASE.get(context.use_case, "Follow the instructions.")
        forced: dict = {}
        temp = TEMPERATURE_BY_USE_CASE.get(context.use_case)
        if temp is not None:
            forced["temperature"] = temp
        # All text use cases return JSON.
        if context.use_case in {
            UseCase.SOURCE_ASSET_PARSE,
            UseCase.TEXT_LITERAL_TRANSLATE,
            UseCase.TEXT_LIGHT_LOCALIZE,
            UseCase.TEXT_TRANSCREATE,
            UseCase.COMPLIANCE_VISION_CHECK,
            UseCase.COMPLIANCE_EXPLANATION,
            UseCase.ASSET_TAGGING,
            UseCase.TRANSLATION_REVIEW,
            UseCase.IMAGE_EDIT_REVIEW,
        }:
            forced["response_format"] = {"type": "json_object"}
        return LayerContribution(
            system_additions=[system],
            forced_params=forced,
            metadata={"use_case": context.use_case.value},
        )
