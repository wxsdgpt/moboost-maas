"""Free-form brand + campaign instructions layer.

Injects ``prompt_additions`` set on the Brand and the Campaign (Project) into
every AI call. Priority 38 so it runs after restrictions / voice but before
glossary, giving the brand admin a fast way to enforce new guidance without
editing restrictions JSON.
"""

from __future__ import annotations

from app.prompt_assembly.base import BaseLayerImpl
from app.prompt_assembly.context import PromptContext
from app.prompt_assembly.trace import LayerContribution
from app.prompt_assembly.use_cases import UseCase


class BrandInstructionsLayer(BaseLayerImpl):
    name = "BrandInstructionsLayer"
    version = "1"
    priority = 38
    applies_to = tuple(UseCase)

    def apply(self, context: PromptContext) -> LayerContribution:
        brand_add = (context.extra or {}).get("brand_prompt_additions") or ""
        campaign_add = (context.extra or {}).get("campaign_prompt_additions") or ""
        additions: list[str] = []
        if brand_add.strip():
            additions.append(
                "Brand-level standing instructions (highest priority after compliance):\n"
                + brand_add.strip()
            )
        if campaign_add.strip():
            additions.append(
                "Campaign-level instructions (apply for this campaign only):\n"
                + campaign_add.strip()
            )
        if not additions:
            return LayerContribution()
        return LayerContribution(
            system_additions=additions,
            metadata={
                "has_brand_additions": bool(brand_add.strip()),
                "has_campaign_additions": bool(campaign_add.strip()),
            },
        )
