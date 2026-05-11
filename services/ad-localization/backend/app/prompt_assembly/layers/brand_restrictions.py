from __future__ import annotations

from app.prompt_assembly.base import BaseLayerImpl
from app.prompt_assembly.context import PromptContext
from app.prompt_assembly.trace import LayerContribution
from app.prompt_assembly.use_cases import UseCase


class BrandRestrictionsLayer(BaseLayerImpl):
    name = "BrandRestrictionsLayer"
    version = "1"
    priority = 30
    applies_to = tuple(UseCase)
    non_truncatable = True

    def apply(self, context: PromptContext) -> LayerContribution:
        r = context.brand_restrictions or {}
        if not r:
            return LayerContribution()
        bullets: list[str] = []
        for el in r.get("forbidden_elements", []) or []:
            if isinstance(el, dict):
                bullets.append(f"NEVER include: {el.get('element')} ({el.get('reason','')})")
            else:
                bullets.append(f"NEVER include: {el}")
        for theme in r.get("forbidden_themes", []) or []:
            bullets.append(f"Avoid theme: {theme}")
        for comp in r.get("competitor_brands", []) or []:
            bullets.append(f"Never reference competitor: {comp}")
        market_specific = (r.get("market_specific_restrictions") or {}).get(context.target_tag)
        if market_specific:
            bullets.append(f"Market-specific restriction: {market_specific}")
        return LayerContribution(
            negative_additions=bullets,
            metadata={"count": len(bullets), "brand_version": context.brand_version},
        )
