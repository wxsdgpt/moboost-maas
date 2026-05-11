"""Anthropic Claude text adapter.

Lazy-imports the official SDK so the rest of the system works without
`pip install anthropic`. Errors cleanly when no key is set.
"""

from __future__ import annotations

from decimal import Decimal

from app.ai.base import AIError, TextAdapter, TextOutput
from app.config import get_settings
from app.logging import get_logger
from app.prompt_assembly import AssembledPrompt

log = get_logger(__name__)

# Best latest default. Can be overridden in settings.extra at call time.
DEFAULT_MODEL = "claude-opus-4-7"

# USD per 1M tokens (approximate — keep updated)
PRICING: dict[str, tuple[Decimal, Decimal]] = {
    "claude-opus-4-7": (Decimal("15"), Decimal("75")),
    "claude-sonnet-4-6": (Decimal("3"), Decimal("15")),
    "claude-haiku-4-5-20251001": (Decimal("0.80"), Decimal("4")),
}


class AnthropicAdapter(TextAdapter):
    def __init__(self, model: str = DEFAULT_MODEL) -> None:
        self.model = model

    async def generate(self, prompt: AssembledPrompt) -> TextOutput:
        settings = get_settings()
        if not settings.anthropic_api_key:
            raise AIError("ANTHROPIC_API_KEY not set")
        try:
            from anthropic import AsyncAnthropic
        except ImportError as e:
            raise AIError("anthropic SDK not installed. `pip install -e .[ai]`") from e

        client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        forced = prompt.forced_params or {}
        temperature = float(forced.get("temperature", 0.2))
        max_tokens = int(forced.get("max_tokens", 2048))

        resp = await client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=prompt.system_prompt or None,
            messages=[{"role": "user", "content": prompt.user_prompt}],
        )
        text = "".join(block.text for block in resp.content if getattr(block, "type", None) == "text")
        cost = _cost(self.model, resp.usage.input_tokens, resp.usage.output_tokens)
        return TextOutput(
            text=text,
            provider_model_id=self.model,
            tokens_input=resp.usage.input_tokens,
            tokens_output=resp.usage.output_tokens,
            cost_usd=cost,
            raw={"id": resp.id, "stop_reason": resp.stop_reason},
        )


def _cost(model: str, tin: int, tout: int) -> Decimal:
    prices = PRICING.get(model)
    if not prices:
        return Decimal(0)
    pin, pout = prices
    return (pin * Decimal(tin) + pout * Decimal(tout)) / Decimal(1_000_000)
