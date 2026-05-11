"""MarketComplianceLayer — priority 100 and non-truncatable. Always wins.

Carries forbidden words, required elements, and market-specific hard rules
into every use case that could produce or modify content. The effective
market_compliance bundle is assembled at the service layer from:
  - system default rules for the target sub-market
  - brand overrides (tighten / relax / disable / add)
  - sub-market prompt_overrides
"""

from __future__ import annotations

from app.prompt_assembly.base import BaseLayerImpl
from app.prompt_assembly.context import PromptContext
from app.prompt_assembly.trace import LayerContribution
from app.prompt_assembly.use_cases import UseCase


class MarketComplianceLayer(BaseLayerImpl):
    name = "MarketComplianceLayer"
    version = "1"
    priority = 100
    applies_to = tuple(UseCase)
    non_truncatable = True

    def apply(self, context: PromptContext) -> LayerContribution:
        c = context.market_compliance or {}
        forbidden_words: list[str] = list(c.get("forbidden_words") or [])
        required_elements: list[str] = list(c.get("required_elements") or [])
        restrictions: list[str] = list(c.get("restrictions") or [])

        lines: list[str] = []
        if forbidden_words:
            lines.append(
                f"FORBIDDEN WORDS / PHRASES for {context.target_tag} (reject or rephrase if these appear): "
                + ", ".join(forbidden_words)
            )
        if required_elements:
            lines.append(
                f"REQUIRED elements that must exist on the final asset in {context.target_tag}: "
                + ", ".join(required_elements)
            )
        for r in restrictions:
            lines.append(f"COMPLIANCE RULE: {r}")

        # DE hard-coded specials (time-window + odds block) per PROJECT.md
        if context.market == "DE":
            lines.append(
                "DE hard limit: do not display specific odds numerics. Maintain a calm audio tone."
            )

        # NG LSLGA / NLRC absolutes
        if context.market == "NG":
            lines.append(
                "NG hard limit: never imply guaranteed wins, no risk, easy money, or sure things."
            )

        negs = list(c.get("negative_additions") or [])
        metadata = {
            "target": context.target_tag,
            "forbidden_words": len(forbidden_words),
            "required_elements": len(required_elements),
        }
        return LayerContribution(
            system_additions=lines,
            negative_additions=negs,
            metadata=metadata,
        )
