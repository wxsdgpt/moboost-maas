"""OpenRouter text + vision adapter.

OpenRouter is OpenAI-compatible, so we reuse the ``openai`` SDK with a custom
``base_url``. Any model id exposed by OpenRouter (anthropic/claude-opus-4,
openai/gpt-4o, google/gemini-2.5-pro, meta-llama/…, etc.) works.

For multimodal parsing (SOURCE_ASSET_PARSE) and vision compliance checks this
adapter switches to the configured ``openrouter_vision_model`` and forwards
images as ``image_url`` chat parts.
"""

from __future__ import annotations

import base64
from decimal import Decimal

from app.ai.base import AIError, TextAdapter, TextOutput
from app.config import get_settings
from app.prompt_assembly import AssembledPrompt


class OpenRouterAdapter(TextAdapter):
    def __init__(
        self,
        *,
        model: str | None = None,
        vision_mode: bool = False,
    ) -> None:
        s = get_settings()
        if not s.openrouter_api_key:
            raise AIError("openrouter_api_key not set — configure it in Admin → API keys")
        if model:
            picked = model
            field = "model"
        elif vision_mode:
            picked = s.openrouter_vision_model
            field = "openrouter_vision_model"
        else:
            picked = s.openrouter_model
            field = "openrouter_model"
        if not picked:
            raise AIError(
                f"{field} not set — fill the model id in Admin → API keys"
            )
        self.model = picked
        self._vision_mode = vision_mode
        self._base_url = s.openrouter_base_url
        self._api_key = s.openrouter_api_key
        self._site = s.openrouter_site_url
        self._app_name = s.openrouter_app_name

    def _client(self):
        try:
            from openai import AsyncOpenAI
        except ImportError as e:
            raise AIError("openai SDK not installed. `pip install -e .[ai]`") from e
        return AsyncOpenAI(
            api_key=self._api_key,
            base_url=self._base_url,
            default_headers={
                # OpenRouter recommends these for rate-limit attribution.
                "HTTP-Referer": self._site,
                "X-Title": self._app_name,
            },
        )

    async def generate(self, prompt: AssembledPrompt) -> TextOutput:
        client = self._client()
        forced = prompt.forced_params or {}
        response_format = forced.get("response_format")
        kwargs: dict = {
            "model": self.model,
            "temperature": float(forced.get("temperature", 0.2)),
            "messages": [
                {"role": "system", "content": prompt.system_prompt or ""},
                {"role": "user", "content": _user_content(prompt)},
            ],
            "max_tokens": int(forced.get("max_tokens", 2048)),
        }
        if response_format:
            # OpenRouter honours OpenAI's json_object mode for most providers.
            kwargs["response_format"] = response_format

        try:
            resp = await client.chat.completions.create(**kwargs)
        except Exception as e:  # noqa: BLE001
            raise AIError(f"OpenRouter call failed: {e}") from e

        msg = resp.choices[0].message.content or ""
        usage = resp.usage
        cost = _cost_from_openrouter(resp)
        return TextOutput(
            text=msg,
            provider_model_id=self.model,
            tokens_input=getattr(usage, "prompt_tokens", None),
            tokens_output=getattr(usage, "completion_tokens", None),
            cost_usd=cost,
            raw={
                "id": resp.id,
                "finish_reason": resp.choices[0].finish_reason,
                "provider": "openrouter",
            },
        )


def _user_content(prompt: AssembledPrompt):
    """Return either a plain string or a list of content parts (text + images).

    OpenRouter follows the OpenAI chat-completions shape: ``content`` is either
    a string or ``[{type, text}, {type, image_url, image_url: {url}}]``.
    """
    parts: list[dict] = []
    text_body = prompt.user_prompt
    if text_body:
        parts.append({"type": "text", "text": text_body})
    for ref in prompt.reference_assets or []:
        if (ref or {}).get("kind") != "image":
            continue
        key = ref.get("storage_key")
        if not key:
            continue
        # If the storage key is a data URL or a fully-qualified URL, pass
        # through. Otherwise load bytes and inline as data URL.
        if isinstance(key, str) and key.startswith(("http://", "https://", "data:")):
            parts.append({"type": "image_url", "image_url": {"url": key}})
        else:
            parts.append(
                {
                    "type": "image_url",
                    "image_url": {"url": _inline_storage(key, ref.get("mime_type"))},
                }
            )
    if len(parts) == 1 and parts[0]["type"] == "text":
        return parts[0]["text"]
    return parts or ""


def _inline_storage(storage_key: str, mime_type: str | None) -> str:
    """Inline a local/S3 asset as a data URL for OpenRouter vision calls.

    Used only when the Prompt Assembly reference_asset carries a bare storage
    key instead of a public URL.
    """
    import asyncio

    from app.storage import get_storage

    try:
        storage = get_storage()
        data = asyncio.get_event_loop().run_until_complete(storage.get(storage_key))  # type: ignore[arg-type]
    except Exception:  # noqa: BLE001
        return f"about:blank#{storage_key}"
    mime = mime_type or "image/png"
    b64 = base64.b64encode(data).decode("ascii")
    return f"data:{mime};base64,{b64}"


def _cost_from_openrouter(resp) -> Decimal:
    """OpenRouter returns per-response usage.total_cost when available."""
    usage = getattr(resp, "usage", None)
    if usage is None:
        return Decimal(0)
    # openai-python>=1.50 exposes extra_body / non-standard fields on .model_dump()
    raw = usage.model_dump() if hasattr(usage, "model_dump") else {}
    for key in ("total_cost", "cost"):
        if raw.get(key) is not None:
            try:
                return Decimal(str(raw[key]))
            except Exception:  # noqa: BLE001
                pass
    return Decimal(0)
