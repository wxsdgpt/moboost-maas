from __future__ import annotations

from app.prompt_assembly.base import BaseLayerImpl
from app.prompt_assembly.context import PromptContext
from app.prompt_assembly.trace import LayerContribution
from app.prompt_assembly.use_cases import UseCase


class MarketCultureLayer(BaseLayerImpl):
    name = "MarketCultureLayer"
    version = "1"
    priority = 55
    applies_to = (
        UseCase.TEXT_LIGHT_LOCALIZE,
        UseCase.TEXT_TRANSCREATE,
        UseCase.IMAGE_ELEMENT_REPLACE,
        UseCase.VIDEO_ELEMENT_REPLACE,
        UseCase.VIDEO_AUDIO_REPLACE,
    )

    def apply(self, context: PromptContext) -> LayerContribution:
        if context.use_case not in self.applies_to:
            return LayerContribution()
        culture = context.market_culture or {}
        additions: list[str] = []
        if culture.get("primary_sport"):
            additions.append(f"Primary sports context: {culture['primary_sport']}.")
        if culture.get("idiomatic_guidance"):
            additions.append(culture["idiomatic_guidance"])
        if culture.get("avoid_references"):
            additions.append(
                "Avoid: " + ", ".join(culture["avoid_references"])
            )
        return LayerContribution(
            system_additions=additions,
            metadata={"market": context.target_tag},
        )
