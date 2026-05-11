from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any


@dataclass
class LayerContribution:
    positive_additions: list[str] = field(default_factory=list)
    negative_additions: list[str] = field(default_factory=list)
    system_additions: list[str] = field(default_factory=list)
    user_additions: list[str] = field(default_factory=list)
    preservation_directives: list[str] = field(default_factory=list)
    mask_constraints: list[dict] = field(default_factory=list)
    audio_prompt_additions: list[str] = field(default_factory=list)
    motion_prompt_additions: list[str] = field(default_factory=list)
    reference_assets: list[dict] = field(default_factory=list)
    few_shot_examples: list[dict] = field(default_factory=list)
    forced_params: dict[str, Any] = field(default_factory=dict)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class LayerTraceEntry:
    layer_name: str
    priority: int
    version: str
    contribution: dict


@dataclass
class AssembledPrompt:
    system_prompt: str
    user_prompt: str
    negative_prompt: str | None
    preservation_directives: list[str]
    mask_constraints: list[dict]
    audio_prompt: str | None
    motion_prompt: str | None
    reference_assets: list[dict]
    few_shot_examples: list[dict]
    forced_params: dict[str, Any]

    def estimated_tokens(self) -> int:
        """Rough proxy: 4 chars per token. Good enough for budget alerts."""
        chars = (
            len(self.system_prompt)
            + len(self.user_prompt)
            + sum(len(x) for x in self.preservation_directives)
            + (len(self.negative_prompt) if self.negative_prompt else 0)
            + (len(self.audio_prompt) if self.audio_prompt else 0)
            + (len(self.motion_prompt) if self.motion_prompt else 0)
            + sum(len(str(e)) for e in self.few_shot_examples)
        )
        return max(1, chars // 4)


@dataclass
class AssemblyTrace:
    use_case: str
    context_snapshot: dict
    layers_applied: list[LayerTraceEntry]
    final_output: dict
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    token_estimate: int | None = None

    def to_dict(self) -> dict:
        return {
            "use_case": self.use_case,
            "context_snapshot": self.context_snapshot,
            "layers_applied": [asdict(l) for l in self.layers_applied],
            "final_output": self.final_output,
            "timestamp": self.timestamp,
            "token_estimate": self.token_estimate,
        }
