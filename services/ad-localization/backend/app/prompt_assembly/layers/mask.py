from __future__ import annotations

from app.prompt_assembly.base import BaseLayerImpl
from app.prompt_assembly.context import PromptContext
from app.prompt_assembly.trace import LayerContribution
from app.prompt_assembly.use_cases import UseCase


class MaskLayer(BaseLayerImpl):
    name = "MaskLayer"
    version = "1"
    priority = 20
    applies_to = (
        UseCase.IMAGE_TEXT_REPLACE,
        UseCase.IMAGE_ELEMENT_REPLACE,
        UseCase.IMAGE_ELEMENT_REMOVE,
        UseCase.VIDEO_TEXT_REPLACE,
        UseCase.VIDEO_ELEMENT_REPLACE,
    )

    def apply(self, context: PromptContext) -> LayerContribution:
        if context.use_case not in self.applies_to:
            return LayerContribution()
        mask = context.mask_region or {}
        return LayerContribution(
            mask_constraints=[mask] if mask else [],
            metadata={"mask_provided": bool(mask)},
            positive_additions=[
                f"Edit region: {mask}" if mask else "Mask region missing — refuse and request"
            ]
            if not mask
            else [],
        )
