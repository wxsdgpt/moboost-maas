"""PromptOverridesLayer — injects admin-editable prompt snippets keyed by
(use_case × market × mode).

Runs at priority 45 — after brand instructions but before source context,
still before Market compliance which stays the highest.
"""

from __future__ import annotations

from app.prompt_assembly.base import BaseLayerImpl
from app.prompt_assembly.context import PromptContext
from app.prompt_assembly.trace import LayerContribution
from app.prompt_assembly.use_cases import UseCase


class PromptOverridesLayer(BaseLayerImpl):
    name = "PromptOverridesLayer"
    version = "1"
    priority = 45
    applies_to = tuple(UseCase)

    def apply(self, context: PromptContext) -> LayerContribution:
        raw = (context.extra or {}).get("prompt_overrides_text") or ""
        if not raw.strip():
            return LayerContribution()
        return LayerContribution(
            system_additions=[raw.strip()],
            metadata={
                "scopes": (context.extra or {}).get("prompt_overrides_scopes", []),
            },
        )
