"""OpenAI fallback adapter (GPT-4 class)."""

from __future__ import annotations

from decimal import Decimal

from app.ai.base import AIError, TextAdapter, TextOutput
from app.config import get_settings
from app.prompt_assembly import AssembledPrompt

DEFAULT_MODEL = "gpt-4o"
PRICING: dict[str, tuple[Decimal, Decimal]] = {
    "gpt-4o": (Decimal("2.50"), Decimal("10.00")),
    "gpt-4o-mini": (Decimal("0.15"), Decimal("0.60")),
}


class OpenAIAdapter(TextAdapter):
    def __init__(self, model: str = DEFAULT_MODEL) -> None:
        self.model = model

    async def generate(self, prompt: AssembledPrompt) -> TextOutput:
        settings = get_settings()
        if not settings.openai_api_key:
            raise AIError("OPENAI_API_KEY not set")
        try:
            from openai import AsyncOpenAI
        except ImportError as e:
            raise AIError("openai SDK not installed. `pip install -e .[ai]`") from e

        client = AsyncOpenAI(api_key=settings.openai_api_key)
        forced = prompt.forced_params or {}
        response_format = forced.get("response_format")
        kwargs: dict = {
            "model": self.model,
            "temperature": float(forced.get("temperature", 0.2)),
            "messages": [
                {"role": "system", "content": prompt.system_prompt or ""},
                {"role": "user", "content": prompt.user_prompt},
            ],
            "max_tokens": int(forced.get("max_tokens", 2048)),
        }
        if response_format:
            kwargs["response_format"] = response_format

        resp = await client.chat.completions.create(**kwargs)
        msg = resp.choices[0].message.content or ""
        prices = PRICING.get(self.model, (Decimal(0), Decimal(0)))
        cost = (
            prices[0] * Decimal(resp.usage.prompt_tokens)
            + prices[1] * Decimal(resp.usage.completion_tokens)
        ) / Decimal(1_000_000)
        return TextOutput(
            text=msg,
            provider_model_id=self.model,
            tokens_input=resp.usage.prompt_tokens,
            tokens_output=resp.usage.completion_tokens,
            cost_usd=cost,
            raw={"id": resp.id, "finish_reason": resp.choices[0].finish_reason},
        )
