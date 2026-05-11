from __future__ import annotations

from app.prompt_assembly.base import BaseLayerImpl
from app.prompt_assembly.context import PromptContext
from app.prompt_assembly.trace import LayerContribution
from app.prompt_assembly.use_cases import UseCase


class BrandVoiceLayer(BaseLayerImpl):
    name = "BrandVoiceLayer"
    version = "1"
    priority = 35
    # Voice only applies where the system is actually creating copy.
    applies_to = (UseCase.TEXT_TRANSCREATE, UseCase.VIDEO_AUDIO_REPLACE)

    def apply(self, context: PromptContext) -> LayerContribution:
        if context.use_case not in self.applies_to:
            return LayerContribution()
        v = context.brand_voice or {}
        if not v:
            return LayerContribution()
        bits: list[str] = []
        if v.get("personality_description"):
            bits.append(f"Brand personality: {v['personality_description']}")
        if v.get("attributes"):
            bits.append("Voice attributes: " + ", ".join(v["attributes"]))
        if v.get("voice_dos"):
            bits.append("Do: " + "; ".join(v["voice_dos"]))
        if v.get("voice_donts"):
            bits.append("Don't: " + "; ".join(v["voice_donts"]))
        if v.get("prohibited_phrases"):
            bits.append("Never use these phrases: " + ", ".join(v["prohibited_phrases"]))
        return LayerContribution(
            system_additions=bits,
            metadata={"attrs": v.get("attributes", [])},
        )
