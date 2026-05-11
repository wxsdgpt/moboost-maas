"""Google Gemini multimodal parser + Nano Banana (Gemini Image) editor.

Phase-3 scaffold: uses google-genai when available. Without the SDK installed,
the adapter raises a clear AIError so callers can fall back to the parser stub.
"""

from __future__ import annotations

from decimal import Decimal

from app.ai.base import AIError, ImageAdapter, ImageEditOutput, TextAdapter, TextOutput
from app.config import get_settings
from app.prompt_assembly import AssembledPrompt

GEMINI_TEXT_MODEL = "gemini-2.5-pro"
NANO_BANANA_MODEL = "gemini-2.5-flash-image"


class GeminiTextAdapter(TextAdapter):
    def __init__(self, model: str = GEMINI_TEXT_MODEL) -> None:
        self.model = model

    async def generate(self, prompt: AssembledPrompt) -> TextOutput:
        settings = get_settings()
        if not settings.google_api_key:
            raise AIError("GOOGLE_API_KEY not set")
        try:
            from google import genai
            from google.genai.types import GenerateContentConfig
        except ImportError as e:
            raise AIError("google-genai not installed. `pip install -e .[ai]`") from e

        client = genai.Client(api_key=settings.google_api_key)
        forced = prompt.forced_params or {}
        cfg = GenerateContentConfig(
            temperature=float(forced.get("temperature", 0.2)),
            system_instruction=prompt.system_prompt or None,
            response_mime_type="application/json"
            if (forced.get("response_format") or {}).get("type") == "json_object"
            else None,
        )
        resp = await client.aio.models.generate_content(
            model=self.model,
            contents=[prompt.user_prompt],
            config=cfg,
        )
        usage = getattr(resp, "usage_metadata", None)
        return TextOutput(
            text=resp.text or "",
            provider_model_id=self.model,
            tokens_input=getattr(usage, "prompt_token_count", None),
            tokens_output=getattr(usage, "candidates_token_count", None),
            cost_usd=Decimal(0),  # TODO: pricing table
            raw={},
        )


class NanoBananaAdapter(ImageAdapter):
    """Image editing via Gemini 2.5 Flash Image ('Nano Banana')."""

    def __init__(self, model: str = NANO_BANANA_MODEL) -> None:
        self.model = model

    async def edit(
        self,
        prompt: AssembledPrompt,
        *,
        source_image: bytes,
        mask_image: bytes | None = None,
    ) -> ImageEditOutput:
        settings = get_settings()
        if not settings.google_api_key:
            raise AIError("GOOGLE_API_KEY not set")
        try:
            from google import genai
            from google.genai.types import Part
        except ImportError as e:
            raise AIError("google-genai not installed. `pip install -e .[ai]`") from e

        client = genai.Client(api_key=settings.google_api_key)

        parts = [
            prompt.user_prompt,
            Part.from_bytes(data=source_image, mime_type="image/png"),
        ]
        if mask_image:
            parts.append(Part.from_bytes(data=mask_image, mime_type="image/png"))

        resp = await client.aio.models.generate_content(
            model=self.model,
            contents=parts,
        )
        # Find the first inline image part in the response
        for part in resp.candidates[0].content.parts:
            inline = getattr(part, "inline_data", None)
            if inline and inline.data:
                return ImageEditOutput(
                    image_bytes=inline.data,
                    mime_type=inline.mime_type or "image/png",
                    provider_model_id=self.model,
                    cost_usd=Decimal(0),
                    raw={},
                )
        raise AIError("Nano Banana returned no image part")
