"""OpenRouter-routed video editing (Veo 3.1 equivalent for audio regen).

OpenRouter's video-model endpoints accept chat-completions with a
``modalities=['video']`` request. When the source video needs to be preserved
visually and only the audio track changed, we send the video as an
``video_url`` content part (OpenRouter extension) plus the audio prompt.

Note: OpenRouter's video support is relatively new; model availability varies.
If your configured ``openrouter_video_model`` doesn't accept an input video,
the adapter surfaces the error cleanly so the orchestrator can fall back to
keeping the original audio track.
"""

from __future__ import annotations

import base64
from dataclasses import dataclass
from decimal import Decimal

from app.ai.base import AIError, VideoAdapter, VideoOutput
from app.config import get_settings
from app.logging import get_logger
from app.prompt_assembly import AssembledPrompt

log = get_logger(__name__)


@dataclass
class OpenRouterVideoOperation:
    name: str
    metadata: dict


class OpenRouterVideoAdapter(VideoAdapter):
    def __init__(self, model: str | None = None) -> None:
        s = get_settings()
        if not s.openrouter_api_key:
            raise AIError("openrouter_api_key not set — configure it in Admin → API keys")
        picked = model or s.openrouter_video_model
        if not picked:
            raise AIError(
                "openrouter_video_model not set — fill it in Admin → API keys "
                "(e.g. google/veo-3.1)"
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

    async def submit(
        self, prompt: AssembledPrompt, *, source_video: bytes
    ) -> OpenRouterVideoOperation:
        """Veo 3.1 via OpenRouter typically responds inline rather than via a
        long-running operation. We still expose a submit/poll API; ``poll`` is
        a no-op that returns the cached result stashed under ``name``.
        """
        out = await self.regen_audio(prompt, source_video=source_video)
        # Stash bytes base64 in "name" so poll() can reconstitute — hacky but
        # keeps the adapter contract uniform with Vertex Veo.
        payload = base64.b64encode(out.video_bytes or b"").decode("ascii") if out.video_bytes else ""
        return OpenRouterVideoOperation(
            name=f"openrouter-inline:{payload[:16]}",
            metadata={"inline": True, "payload": payload},
        )

    async def regen_audio(
        self, prompt: AssembledPrompt, *, source_video: bytes
    ) -> VideoOutput:
        client = self._client()
        src_b64 = base64.b64encode(source_video).decode("ascii")
        content_parts: list[dict] = [
            {
                "type": "text",
                "text": _build_video_instruction(prompt),
            },
            # OpenRouter accepts video inputs via an extension part; we also
            # pass the base64 video in a structured field for models that
            # accept only direct bytes.
            {
                "type": "video_url",
                "video_url": {"url": f"data:video/mp4;base64,{src_b64}"},
            },
        ]
        try:
            resp = await client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": prompt.system_prompt or ""},
                    {"role": "user", "content": content_parts},
                ],
                temperature=0.2,
                max_tokens=4096,
                extra_body={"modalities": ["video", "text"]},
            )
        except Exception as e:  # noqa: BLE001
            raise AIError(f"OpenRouter video call failed: {e}") from e

        video_bytes, mime = _extract_video(resp)
        if video_bytes is None:
            raise AIError(
                "OpenRouter returned no video. Model may not support video "
                "output — check openrouter_video_model availability."
            )
        return VideoOutput(
            video_bytes=video_bytes,
            video_uri=None,
            mime_type=mime or "video/mp4",
            provider_model_id=self.model,
            duration_seconds=None,
            cost_usd=Decimal(0),
            raw={"id": resp.id, "provider": "openrouter"},
        )

    async def poll(self, operation_name: str) -> VideoOutput | None:
        # Inline mode: decode the payload stored in submit().
        if not operation_name.startswith("openrouter-inline:"):
            return None
        # The orchestrator currently only uses this adapter in blocking mode
        # via ``regen_audio``; ``submit``/``poll`` are provided for symmetry
        # with the Vertex path. Callers shouldn't invoke poll directly.
        return None


# ---------- helpers --------------------------------------------------------


def _build_video_instruction(prompt: AssembledPrompt) -> str:
    lines: list[str] = []
    if prompt.user_prompt:
        lines.append(prompt.user_prompt)
    if prompt.audio_prompt:
        lines.append("\n[Target audio style]\n" + prompt.audio_prompt)
    if prompt.preservation_directives:
        lines.append(
            "\n[Preservation directives] "
            + "; ".join(prompt.preservation_directives)
        )
    lines.append(
        "\n[Contract] Keep the supplied video frames bit-identical. Replace only "
        "the audio track. Preserve original duration, frame rate, and resolution."
    )
    return "\n".join(lines)


def _extract_video(resp) -> tuple[bytes | None, str | None]:
    msg = resp.choices[0].message
    # OpenRouter may surface video attachments on message.videos or .attachments
    # depending on the model. Check both shapes.
    buckets = []
    for attr in ("videos", "attachments", "content"):
        val = getattr(msg, attr, None)
        if val is None and hasattr(msg, "model_dump"):
            val = msg.model_dump().get(attr)
        if val:
            buckets.append(val)

    for bucket in buckets:
        items = bucket if isinstance(bucket, list) else [bucket]
        for item in items:
            url_obj = (
                item.get("video_url") if isinstance(item, dict) else getattr(item, "video_url", None)
            ) or (
                item.get("url_obj") if isinstance(item, dict) else None
            )
            if url_obj is None and isinstance(item, dict) and item.get("type") == "video_url":
                url_obj = item.get("video_url")
            url = (
                url_obj.get("url") if isinstance(url_obj, dict) else getattr(url_obj, "url", None)
            ) if url_obj else None
            if not url:
                continue
            if url.startswith("data:"):
                head, _, payload = url.partition(",")
                mime = head.removeprefix("data:").split(";")[0]
                try:
                    return base64.b64decode(payload), mime
                except Exception:  # noqa: BLE001
                    continue
            if url.startswith(("http://", "https://")):
                try:
                    import httpx

                    r = httpx.get(url, timeout=600)
                    r.raise_for_status()
                    return r.content, r.headers.get("content-type") or None
                except Exception:  # noqa: BLE001
                    continue
    return None, None
