from __future__ import annotations

from app.prompt_assembly.base import BaseLayerImpl
from app.prompt_assembly.context import PromptContext
from app.prompt_assembly.trace import LayerContribution
from app.prompt_assembly.use_cases import UseCase

# Per PROMPT_ASSEMBLY.md §"Market Audio Layer Examples" — static per-market style hints.
MARKET_AUDIO_GUIDANCE: dict[str, list[str]] = {
    "DE": [
        "measured German voiceover in Hochdeutsch",
        "calm, observational tone",
        "NO crowd cheering or excited reactions",
        "professional sports commentary style",
    ],
    "BR": [
        "warm Brazilian Portuguese voice (pt-BR, NOT pt-PT)",
        "moderate energy, friendly tone",
        "authentic Brazilian sports commentary style",
    ],
    "UK": [
        "measured British English",
        "received pronunciation",
        "avoid overly excited delivery (UKGC compliance)",
    ],
    "FR": [
        "clear French voiceover",
        "moderate energy",
        "neutral Parisian accent",
    ],
    "US": [
        "American English sports commentator",
        "neutral professional tone",
        "no college / NCAA-specific references",
    ],
    "IN": [
        "Indian English accent (RP-compatible)",
        "clear enunciation",
        "cricket-aware vocabulary",
    ],
    "PH": [
        "Filipino English or Tagalog as specified",
        "warm, conversational",
        "basketball-aware vocabulary",
    ],
    "NG": [
        "Nigerian English (en-NG), clear and confident",
        "energetic but measured — avoid hype bordering on guarantee",
        "football-first vocabulary (Premier League, AFCON, Super Eagles references OK; avoid active Super Eagles player names unless licensed)",
        "no language implying guaranteed winnings or easy money (LSLGA / NLRC)",
    ],
}


class MarketAudioLayer(BaseLayerImpl):
    name = "MarketAudioLayer"
    version = "1"
    priority = 60
    applies_to = (UseCase.VIDEO_AUDIO_REPLACE,)

    def apply(self, context: PromptContext) -> LayerContribution:
        if context.use_case not in self.applies_to:
            return LayerContribution()
        # Prefer sub-market guidance if provided via context.market_audio; else
        # fall back to parent-market defaults.
        parent = context.market.upper()
        provided = context.market_audio or {}
        additions = list(provided.get("audio_prompt_additions") or [])
        if not additions:
            additions = list(MARKET_AUDIO_GUIDANCE.get(parent, []))
        return LayerContribution(
            audio_prompt_additions=additions,
            metadata={"market": context.target_tag, "fallback_to_parent": bool(not provided)},
        )
