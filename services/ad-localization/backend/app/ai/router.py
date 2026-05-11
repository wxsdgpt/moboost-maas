"""Pick the right adapter per use case.

Preference order (all paths):
  1. OpenRouter (OpenAI-compatible gateway — one key, covers text / vision /
     image editing via Nano Banana / video audio regen via Veo 3.1)
  2. Native Anthropic / OpenAI / Gemini / Vertex Veo fallbacks

When ``openrouter_api_key`` is set, EVERY adapter routes through OpenRouter.
Switch underlying models via the ``openrouter_*_model`` settings in Admin →
API keys.
"""

from __future__ import annotations

from app.ai.base import ImageAdapter, TextAdapter, VideoAdapter
from app.config import get_settings
from app.prompt_assembly import UseCase

VISION_USE_CASES = {
    UseCase.SOURCE_ASSET_PARSE,
    UseCase.COMPLIANCE_VISION_CHECK,
    UseCase.IMAGE_EDIT_REVIEW,
}


def _review_model_for(use_case: UseCase | None) -> str | None:
    s = get_settings()
    if use_case is UseCase.TRANSLATION_REVIEW:
        return s.openrouter_text_review_model or None
    if use_case is UseCase.IMAGE_EDIT_REVIEW:
        return s.openrouter_image_review_model or None
    return None


def get_text_adapter(use_case: UseCase | None = None) -> TextAdapter:
    s = get_settings()
    vision = use_case in VISION_USE_CASES

    if s.openrouter_api_key:
        from app.ai.openrouter_adapter import OpenRouterAdapter

        # Review calls: use the dedicated text / image reviewer model.
        review_model = _review_model_for(use_case)
        if review_model:
            return OpenRouterAdapter(model=review_model, vision_mode=vision)
        return OpenRouterAdapter(vision_mode=vision)

    if vision and s.google_api_key:
        from app.ai.gemini_adapter import GeminiTextAdapter

        return GeminiTextAdapter()

    if s.anthropic_api_key:
        from app.ai.anthropic_adapter import AnthropicAdapter

        return AnthropicAdapter()
    if s.openai_api_key:
        from app.ai.openai_adapter import OpenAIAdapter

        return OpenAIAdapter()
    if s.google_api_key:
        from app.ai.gemini_adapter import GeminiTextAdapter

        return GeminiTextAdapter()

    raise RuntimeError(
        "no text adapter configured — set OPENROUTER_API_KEY (preferred) or one of "
        "ANTHROPIC_API_KEY / OPENAI_API_KEY / GOOGLE_API_KEY"
    )


def get_image_adapter() -> ImageAdapter:
    s = get_settings()
    if s.openrouter_api_key:
        from app.ai.openrouter_image import OpenRouterImageAdapter

        return OpenRouterImageAdapter()
    from app.ai.gemini_adapter import NanoBananaAdapter

    return NanoBananaAdapter()


def get_video_adapter() -> VideoAdapter:
    s = get_settings()
    if s.openrouter_api_key:
        from app.ai.openrouter_video import OpenRouterVideoAdapter

        return OpenRouterVideoAdapter()
    from app.ai.veo_adapter import VeoAdapter

    return VeoAdapter()
