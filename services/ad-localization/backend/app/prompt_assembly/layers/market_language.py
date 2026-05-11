from __future__ import annotations

from app.prompt_assembly.base import BaseLayerImpl
from app.prompt_assembly.context import PromptContext
from app.prompt_assembly.trace import LayerContribution
from app.prompt_assembly.use_cases import UseCase

# Market → default content language per UI_LANGUAGE_SPEC.md
MARKET_LANGUAGE: dict[str, str] = {
    "US": "en-US",
    "UK": "en-GB",
    "UK-GB": "en-GB",
    "UK-NI": "en-GB",
    "PH": "en-PH",
    "IN": "en-IN",
    "BR": "pt-BR",
    "FR": "fr-FR",
    "DE": "de-DE",
    "NG": "en-NG",
}


class MarketLanguageLayer(BaseLayerImpl):
    name = "MarketLanguageLayer"
    version = "1"
    priority = 50
    applies_to = (
        UseCase.TEXT_LITERAL_TRANSLATE,
        UseCase.TEXT_LIGHT_LOCALIZE,
        UseCase.TEXT_TRANSCREATE,
        UseCase.IMAGE_TEXT_REPLACE,
        UseCase.VIDEO_TEXT_REPLACE,
        UseCase.VIDEO_AUDIO_REPLACE,
    )

    def apply(self, context: PromptContext) -> LayerContribution:
        if context.use_case not in self.applies_to:
            return LayerContribution()
        lang = context.target_language
        if lang is None:
            # US states inherit US language; sub-markets with explicit codes win.
            lang = MARKET_LANGUAGE.get(context.target_tag) or MARKET_LANGUAGE.get(
                context.market, "en-US"
            )
        lines = [f"Target language: {lang} (use BCP 47; never substitute regional variants)."]
        if lang == "pt-BR":
            lines.append("This is Brazilian Portuguese. Never use pt-PT vocabulary or grammar.")
        if lang == "en-NG":
            lines.append(
                "Nigerian English: clear and standard; football = association football."
            )
        return LayerContribution(
            system_additions=lines,
            metadata={"lang": lang},
        )
