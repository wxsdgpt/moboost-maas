from __future__ import annotations

from app.prompt_assembly.base import BaseLayerImpl
from app.prompt_assembly.context import PromptContext
from app.prompt_assembly.trace import LayerContribution
from app.prompt_assembly.use_cases import UseCase


class FewShotLayer(BaseLayerImpl):
    name = "FewShotLayer"
    version = "1"
    priority = 85
    applies_to = (UseCase.TEXT_TRANSCREATE,)
    # Truncatable — goes first when we need to trim token budget.
    non_truncatable = False

    def apply(self, context: PromptContext) -> LayerContribution:
        if context.use_case is not UseCase.TEXT_TRANSCREATE:
            return LayerContribution()
        examples = context.few_shot_examples or []
        if not examples:
            return LayerContribution()
        return LayerContribution(
            few_shot_examples=examples,
            metadata={"count": len(examples)},
        )
