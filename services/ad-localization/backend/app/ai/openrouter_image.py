"""OpenRouter-routed image editing (Nano Banana equivalent).

OpenRouter fronts Gemini 2.5 Flash Image ("Nano Banana") through an
OpenAI-compatible chat-completions endpoint. We send the source image + mask
as ``image_url`` content parts and ask for an image response via
``modalities=['image', 'text']``. OpenRouter returns generated image parts on
``choices[0].message.images``.
"""

from __future__ import annotations

import base64
from decimal import Decimal

from app.ai.base import AIError, ImageAdapter, ImageEditOutput
from app.config import get_settings
from app.logging import get_logger
from app.prompt_assembly import AssembledPrompt

log = get_logger(__name__)


class OpenRouterImageAdapter(ImageAdapter):
    def __init__(self, model: str | None = None) -> None:
        s = get_settings()
        if not s.openrouter_api_key:
            raise AIError("openrouter_api_key not set — configure it in Admin → API keys")
        picked = model or s.openrouter_image_edit_model
        if not picked:
            raise AIError(
                "openrouter_image_edit_model not set — fill it in Admin → API keys "
                "(e.g. google/gemini-2.5-flash-image-preview)"
            )
        self.model = picked
        self._api_key = s.openrouter_api_key
        self._base_url = s.openrouter_base_url
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
                "HTTP-Referer": self._site,
                "X-Title": self._app_name,
            },
        )

    async def edit(
        self,
        prompt: AssembledPrompt,
        *,
        source_image: bytes,
        mask_image: bytes | None = None,
    ) -> ImageEditOutput:
        client = self._client()
        content_parts: list[dict] = [
            {
                "type": "text",
                "text": _build_edit_instruction(prompt, mask_image is not None),
            },
            _image_part(source_image, role="source"),
        ]
        if mask_image:
            content_parts.append(_image_part(mask_image, role="mask", mime="image/png"))

        try:
            resp = await client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": prompt.system_prompt or ""},
                    {"role": "user", "content": content_parts},
                ],
                temperature=0.2,
                max_tokens=2048,
                modalities=["image", "text"],
            )
        except TypeError:
            # Older openai-python versions don't pass `modalities` through;
            # fall back to extra_body which is always forwarded.
            resp = await client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": prompt.system_prompt or ""},
                    {"role": "user", "content": content_parts},
                ],
                temperature=0.2,
                max_tokens=2048,
                extra_body={"modalities": ["image", "text"]},
            )
        except Exception as e:  # noqa: BLE001
            raise AIError(f"OpenRouter image edit failed: {e}") from e

        image_bytes, mime = _extract_image(resp)
        if image_bytes is None:
            raise AIError(
                "OpenRouter returned no image. Model may not support image "
                "output — set openrouter_image_edit_model to google/gemini-2.5-flash-image-preview."
            )
        return ImageEditOutput(
            image_bytes=image_bytes,
            mime_type=mime or "image/png",
            provider_model_id=self.model,
            cost_usd=Decimal(0),
            raw={"id": resp.id, "provider": "openrouter"},
        )


# ---------- helpers --------------------------------------------------------


def _build_edit_instruction(prompt: AssembledPrompt, has_mask: bool) -> str:
    parts = [prompt.user_prompt or ""]
    if has_mask:
        parts.append(
            "\n\n[Mask semantics] A mask image is included below. White pixels "
            "mark the region that MAY be edited; black pixels must be preserved "
            "bit-identically. Only modify pixels inside the white mask area."
        )
    if prompt.preservation_directives:
        parts.append(
            "\n\n[Preservation directives] " + "; ".join(prompt.preservation_directives)
        )
    if prompt.negative_prompt:
        parts.append("\n\n[Avoid] " + prompt.negative_prompt)
    return "\n".join(p for p in parts if p)


def _image_part(data: bytes, *, role: str, mime: str = "image/png") -> dict:
    b64 = base64.b64encode(data).decode("ascii")
    return {
        "type": "image_url",
        "image_url": {
            "url": f"data:{mime};base64,{b64}",
        },
    }


def _extract_image(resp) -> tuple[bytes | None, str | None]:
    """OpenRouter returns generated images in ``message.images`` as a list of
    ``{type: 'image_url', image_url: {url}}`` dicts. The url is either a data
    URL or an https URL.
    """
    msg = resp.choices[0].message
    images = (
        getattr(msg, "images", None)
        or (msg.model_dump().get("images") if hasattr(msg, "model_dump") else None)
        or []
    )
    for img in images:
        url_obj = img.get("image_url") if isinstance(img, dict) else getattr(img, "image_url", None)
        url = url_obj.get("url") if isinstance(url_obj, dict) else getattr(url_obj, "url", None)
        if not url:
            continue
        if url.startswith("data:"):
            head, _, payload = url.partition(",")
            mime = head.removeprefix("data:").split(";")[0] if ";" in head else head.removeprefix("data:")
            try:
                return base64.b64decode(payload), mime
            except Exception:  # noqa: BLE001
                continue
        if url.startswith(("http://", "https://")):
            try:
                import httpx

                bytes_resp = httpx.get(url, timeout=60)
                bytes_resp.raise_for_status()
                return bytes_resp.content, bytes_resp.headers.get("content-type") or None
            except Exception:  # noqa: BLE001
                continue
    return None, None
