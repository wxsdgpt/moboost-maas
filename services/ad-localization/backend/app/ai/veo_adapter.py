"""Veo 3.1 video audio regeneration via Vertex AI.

Asynchronous by design: `submit` returns a long-running operation name, and
`poll` drives it to completion. The orchestrator enqueues a procrastinate task
that polls every 30s and writes the resulting MP4 back to storage.

The Vertex SDK / endpoint shape is loaded lazily so the app boots without GCP
credentials. Callers should handle AIError and fall back to keeping the source
audio when the adapter is unavailable.
"""

from __future__ import annotations

import asyncio
import base64
from dataclasses import dataclass
from decimal import Decimal

from app.ai.base import AIError, VideoAdapter, VideoOutput
from app.config import get_settings
from app.logging import get_logger
from app.prompt_assembly import AssembledPrompt

log = get_logger(__name__)

VEO_MODEL_ID = "veo-3.1-fast-generate-preview"
VEO_PRICING_USD_PER_SECOND = Decimal("0.40")


@dataclass
class VeoOperation:
    name: str
    metadata: dict


class VeoAdapter(VideoAdapter):
    def __init__(self, model: str = VEO_MODEL_ID) -> None:
        self.model = model

    async def submit(self, prompt: AssembledPrompt, *, source_video: bytes) -> VeoOperation:
        s = get_settings()
        if not s.google_project_id:
            raise AIError("GOOGLE_PROJECT_ID not set for Veo")
        client = _lazy_vertex_client(s)
        request_body = _build_request(prompt, source_video, self.model)
        resp = await asyncio.to_thread(client.long_running_generate, request_body)
        return VeoOperation(name=resp["name"], metadata=resp.get("metadata", {}))

    async def regen_audio(self, prompt: AssembledPrompt, *, source_video: bytes) -> VideoOutput:
        """Submit + poll to completion in-process (blocks until done)."""
        op = await self.submit(prompt, source_video=source_video)
        while True:
            status = await self.poll(op.name)
            if status is not None:
                return status
            await asyncio.sleep(15)

    async def poll(self, operation_name: str) -> VideoOutput | None:
        s = get_settings()
        client = _lazy_vertex_client(s)
        resp = await asyncio.to_thread(client.get_operation, operation_name)
        if not resp.get("done"):
            return None
        if "error" in resp:
            raise AIError(f"Veo operation failed: {resp['error']}")

        response = resp.get("response") or {}
        videos = response.get("generatedSamples") or response.get("videos") or []
        if not videos:
            raise AIError("Veo returned no video")
        first = videos[0]
        data_b64 = first.get("bytesBase64Encoded")
        uri = first.get("uri") or first.get("gcsUri")
        duration_seconds = float(first.get("durationSeconds") or 0) or None
        video_bytes = base64.b64decode(data_b64) if data_b64 else None

        cost = (
            VEO_PRICING_USD_PER_SECOND * Decimal(duration_seconds)
            if duration_seconds
            else Decimal(0)
        )
        return VideoOutput(
            video_bytes=video_bytes,
            video_uri=uri,
            mime_type="video/mp4",
            provider_model_id=self.model,
            duration_seconds=duration_seconds,
            cost_usd=cost,
            raw=resp,
        )


def _build_request(prompt: AssembledPrompt, source_video: bytes, model: str) -> dict:
    return {
        "model": model,
        "audio_prompt": prompt.audio_prompt or "",
        "system_prompt": prompt.system_prompt,
        "user_prompt": prompt.user_prompt,
        "preservation_directives": prompt.preservation_directives,
        "source_video_b64": base64.b64encode(source_video).decode("ascii"),
        "parameters": {
            "sampleCount": 1,
            "durationSeconds": None,  # inherit from source
            "aspectRatio": None,
        },
    }


def _lazy_vertex_client(settings):
    try:
        from google.cloud import aiplatform  # noqa: F401
    except ImportError as e:
        raise AIError(
            "google-cloud-aiplatform not installed. `pip install -e .[ai]`"
        ) from e

    class _VertexClient:
        # Vertex SDK exposes Veo long-running endpoints via `generative_models`
        # and the REST `operations` surface. Shape is Preview-only for 3.1 so
        # we keep a thin client object here; swap in the concrete call when
        # the GA shape stabilizes.
        def long_running_generate(self, body: dict) -> dict:
            raise AIError(
                "VertexClient.long_running_generate is not yet wired — "
                "see Vertex SDK docs for the current Veo 3.1 endpoint."
            )

        def get_operation(self, operation_name: str) -> dict:
            raise AIError(
                "VertexClient.get_operation is not yet wired — see Vertex SDK docs."
            )

    return _VertexClient()
