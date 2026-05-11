"""SourceAnchorLayer — the core of a localization tool per PROMPT_ASSEMBLY.md.

Tells the AI: "Don't change anything except what I explicitly asked."
Contributes both prompt additions AND preservation directives that the
Change Minimization verifier picks up.
"""

from __future__ import annotations

from app.prompt_assembly.base import BaseLayerImpl
from app.prompt_assembly.context import PromptContext
from app.prompt_assembly.trace import LayerContribution
from app.prompt_assembly.use_cases import UseCase

EDIT_USE_CASES = (
    UseCase.IMAGE_TEXT_REPLACE,
    UseCase.IMAGE_ELEMENT_REPLACE,
    UseCase.IMAGE_ELEMENT_REMOVE,
    UseCase.VIDEO_TEXT_REPLACE,
    UseCase.VIDEO_ELEMENT_REPLACE,
    UseCase.VIDEO_AUDIO_REPLACE,
)


class SourceAnchorLayer(BaseLayerImpl):
    name = "SourceAnchorLayer"
    version = "1"
    priority = 15
    applies_to = EDIT_USE_CASES
    non_truncatable = True

    def apply(self, context: PromptContext) -> LayerContribution:
        if context.use_case not in EDIT_USE_CASES:
            return LayerContribution()

        if context.use_case is UseCase.VIDEO_AUDIO_REPLACE:
            return LayerContribution(
                positive_additions=[
                    "Keep ALL video frames exactly as in source.",
                    "Only replace the audio track.",
                    "Preserve original video timing, frame rate, resolution.",
                ],
                negative_additions=[
                    "video regeneration",
                    "frame modification",
                    "visual changes",
                ],
                preservation_directives=["video_frames_bit_identical"],
                metadata={"anchor": "audio_only"},
            )

        if context.use_case is UseCase.IMAGE_ELEMENT_REMOVE:
            return LayerContribution(
                positive_additions=[
                    "Remove the element inside the mask only.",
                    "Inpaint plausibly based on the surrounding pixels.",
                    "Preserve all pixels outside the mask exactly.",
                ],
                negative_additions=[
                    "global retouching",
                    "style transfer",
                    "composition changes",
                ],
                preservation_directives=["perceptual_hash_match_required_outside_mask"],
                metadata={"anchor": "remove_only"},
            )

        # Image / video element replace + text replace
        return LayerContribution(
            positive_additions=[
                "Edit ONLY the region inside the provided mask.",
                "Preserve all other pixels exactly as in the source.",
                "Maintain original lighting, color grading, shadows, and reflections.",
                "Do not modify any person, object, or background outside the mask.",
            ],
            negative_additions=[
                "stylistic reinterpretation",
                "creative additions",
                "background changes",
                "lighting changes",
            ],
            preservation_directives=["perceptual_hash_match_required_outside_mask"],
            metadata={"anchor": "mask_only_edit"},
        )
