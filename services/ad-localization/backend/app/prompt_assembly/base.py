from __future__ import annotations

from typing import ClassVar, Protocol

from app.prompt_assembly.context import PromptContext
from app.prompt_assembly.trace import LayerContribution
from app.prompt_assembly.use_cases import UseCase


class PromptLayer(Protocol):
    name: ClassVar[str]
    version: ClassVar[str]
    priority: ClassVar[int]
    applies_to: ClassVar[tuple[UseCase, ...]]
    # MarketComplianceLayer / SourceAnchorLayer set this so budget-driven
    # truncation never removes them.
    non_truncatable: ClassVar[bool]

    def apply(self, context: PromptContext) -> LayerContribution: ...


class BaseLayerImpl:
    name: ClassVar[str] = ""
    version: ClassVar[str] = "1"
    priority: ClassVar[int] = 1000
    applies_to: ClassVar[tuple[UseCase, ...]] = ()
    non_truncatable: ClassVar[bool] = False

    def apply(self, context: PromptContext) -> LayerContribution:  # pragma: no cover
        raise NotImplementedError
