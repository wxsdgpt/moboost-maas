from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Protocol

from app.prompt_assembly import AssembledPrompt


class AIError(RuntimeError):
    pass


@dataclass
class TextOutput:
    text: str
    provider_model_id: str
    tokens_input: int | None = None
    tokens_output: int | None = None
    cost_usd: Decimal = Decimal(0)
    raw: dict = field(default_factory=dict)


@dataclass
class ImageEditOutput:
    image_bytes: bytes
    mime_type: str
    provider_model_id: str
    cost_usd: Decimal = Decimal(0)
    raw: dict = field(default_factory=dict)


@dataclass
class VideoOutput:
    video_bytes: bytes | None
    video_uri: str | None
    mime_type: str
    provider_model_id: str
    duration_seconds: float | None = None
    cost_usd: Decimal = Decimal(0)
    raw: dict = field(default_factory=dict)


class TextAdapter(Protocol):
    async def generate(self, prompt: AssembledPrompt) -> TextOutput: ...


class ImageAdapter(Protocol):
    async def edit(
        self,
        prompt: AssembledPrompt,
        *,
        source_image: bytes,
        mask_image: bytes | None = None,
    ) -> ImageEditOutput: ...


class VideoAdapter(Protocol):
    async def regen_audio(
        self,
        prompt: AssembledPrompt,
        *,
        source_video: bytes,
    ) -> VideoOutput: ...
