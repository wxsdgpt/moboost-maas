from app.prompt_assembly.layers.brand_glossary import BrandGlossaryLayer
from app.prompt_assembly.layers.brand_instructions import BrandInstructionsLayer
from app.prompt_assembly.layers.brand_restrictions import BrandRestrictionsLayer
from app.prompt_assembly.layers.brand_voice import BrandVoiceLayer
from app.prompt_assembly.layers.core_base import BaseLayer
from app.prompt_assembly.layers.few_shot import FewShotLayer
from app.prompt_assembly.layers.font_style import FontStyleLayer
from app.prompt_assembly.layers.market_audio import MarketAudioLayer
from app.prompt_assembly.layers.market_compliance import MarketComplianceLayer
from app.prompt_assembly.layers.market_culture import MarketCultureLayer
from app.prompt_assembly.layers.market_language import MarketLanguageLayer
from app.prompt_assembly.layers.mask import MaskLayer
from app.prompt_assembly.layers.prompt_overrides import PromptOverridesLayer
from app.prompt_assembly.layers.source_anchor import SourceAnchorLayer
from app.prompt_assembly.layers.source_context import SourceContextLayer
from app.prompt_assembly.layers.user_instruction import UserInstructionLayer

ALL_LAYERS = [
    BaseLayer(),
    SourceAnchorLayer(),
    MaskLayer(),
    FontStyleLayer(),
    BrandRestrictionsLayer(),
    BrandVoiceLayer(),
    BrandInstructionsLayer(),
    BrandGlossaryLayer(),
    PromptOverridesLayer(),  # priority 45 — admin-editable market / use-case snippets
    MarketLanguageLayer(),
    MarketCultureLayer(),
    MarketAudioLayer(),
    UserInstructionLayer(),
    SourceContextLayer(),
    FewShotLayer(),
    MarketComplianceLayer(),  # priority 100 — always last, always wins
]

__all__ = [
    "ALL_LAYERS",
    "BaseLayer",
    "SourceAnchorLayer",
    "MaskLayer",
    "FontStyleLayer",
    "BrandRestrictionsLayer",
    "BrandVoiceLayer",
    "BrandInstructionsLayer",
    "BrandGlossaryLayer",
    "PromptOverridesLayer",
    "MarketLanguageLayer",
    "MarketCultureLayer",
    "MarketAudioLayer",
    "UserInstructionLayer",
    "SourceContextLayer",
    "FewShotLayer",
    "MarketComplianceLayer",
]
