from __future__ import annotations

from app.prompt_assembly.base import BaseLayerImpl
from app.prompt_assembly.context import PromptContext
from app.prompt_assembly.trace import LayerContribution
from app.prompt_assembly.use_cases import UseCase


class UserInstructionLayer(BaseLayerImpl):
    name = "UserInstructionLayer"
    version = "1"
    priority = 70
    applies_to = tuple(UseCase)

    def apply(self, context: PromptContext) -> LayerContribution:
        if not context.user_instructions and not context.user_provided_content:
            return LayerContribution()
        bits: list[str] = []
        if context.user_instructions:
            bits.append("User intent: " + context.user_instructions.strip())
        if context.user_provided_content:
            bits.append(
                "User-provided target content (use verbatim where possible): "
                + context.user_provided_content.strip()
            )
        return LayerContribution(user_additions=bits, metadata={"has_user_input": True})
