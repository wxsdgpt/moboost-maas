"""Flattened image parser — multimodal LLM entry point.

Two modes:
  * With OpenRouter vision model configured → real call via OpenRouterAdapter
    using the SOURCE_ASSET_PARSE prompt-assembly use case; returns structured
    text / visual LU candidates.
  * Without the model → structural metadata + a warning so the downstream
    pipeline still succeeds end-to-end.

Falls back to Google Gemini when GOOGLE_API_KEY is set but OpenRouter vision
is unconfigured (legacy path).
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
import time

from app.config import get_settings
from app.logging import get_logger
from app.models.enums import LUType, SemanticRole
from app.parsers.base import (
    LUCandidate,
    ParsedResult,
    ParserError,
    SourceLocation,
)
from app.prompt_assembly import PromptContext, UseCase, assemble

log = get_logger(__name__)

_ROLE_FROM_STRING = {role.value: role for role in SemanticRole}


def parse_flattened_image(data: bytes, *, mime_type: str | None = None) -> ParsedResult:
    try:
        from PIL import Image
    except ImportError as e:
        raise ParserError(
            "Pillow is not installed. Run `pip install Pillow`."
        ) from e

    start = time.monotonic()
    try:
        with Image.open(io.BytesIO(data)) as img:
            width, height = img.size
            fmt = (img.format or "unknown").lower()
    except Exception as e:  # noqa: BLE001
        raise ParserError(f"failed to open image: {e}") from e

    # Detect the real MIME from the image format
    if not mime_type:
        _fmt_to_mime = {"jpeg": "image/jpeg", "jpg": "image/jpeg", "png": "image/png",
                        "gif": "image/gif", "webp": "image/webp", "bmp": "image/bmp"}
        mime_type = _fmt_to_mime.get(fmt, "image/png")

    settings = get_settings()

    # Prefer OpenRouter vision path; fall back to Gemini; fall back to metadata-only
    has_openrouter = bool(settings.openrouter_api_key and settings.openrouter_vision_model)
    has_gemini = bool(settings.google_api_key)

    if not has_openrouter and not has_gemini:
        duration_ms = int((time.monotonic() - start) * 1000)
        return ParsedResult(
            parse_method="multimodal_llm",
            parse_model_used="(not configured)",
            parse_confidence=None,
            parse_warnings=[
                "No vision model configured — structural metadata only. "
                "Set ADLOC_OPENROUTER_API_KEY + ADLOC_OPENROUTER_VISION_MODEL, "
                "or ADLOC_GOOGLE_API_KEY to enable text / visual LU extraction."
            ],
            structural_metadata={
                "dimensions": {"width": width, "height": height},
                "format": fmt,
                "mime": mime_type,
            },
            lus=[],
            parse_duration_ms=duration_ms,
        )

    # Assemble the prompt
    ctx = PromptContext(
        use_case=UseCase.SOURCE_ASSET_PARSE,
        market="*",
        source_content={
            "mime_type": mime_type,
            "dimensions": {"width": width, "height": height},
        },
    )
    prompt, trace = assemble(ctx)

    raw_json: str | None = None
    model_used: str = "(unknown)"

    if has_openrouter:
        # ── OpenRouter vision path (preferred) ──
        raw_json, model_used = _call_openrouter_vision(prompt, data, mime_type)
    elif has_gemini:
        # ── Legacy Gemini path ──
        try:
            raw_json = _call_gemini_sync(prompt, data)
            model_used = "gemini-2.5-pro"
        except Exception as e:  # noqa: BLE001
            log.warning("image_parser.gemini_failed", error=str(e))

    # Parse the JSON response into LU candidates
    warnings: list[str] = []
    lus: list[LUCandidate] = []

    if raw_json is None:
        warnings.append("Vision model call failed or returned no JSON; empty LU set.")
    else:
        log.info("image_parser.raw_response", raw_json_preview=raw_json[:2000] if raw_json else None)
        # Strip markdown code fences that some models wrap around JSON
        cleaned = raw_json.strip()
        if cleaned.startswith("```"):
            # Remove opening fence (```json or ```)
            first_nl = cleaned.index("\n") if "\n" in cleaned else len(cleaned)
            cleaned = cleaned[first_nl + 1:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3].strip()
        try:
            payload = json.loads(cleaned)
        except json.JSONDecodeError:
            warnings.append("Vision model JSON could not be parsed; empty LU set.")
            log.error("image_parser.json_parse_failed", raw_json_preview=raw_json[:500] if raw_json else None)
            payload = {}
        log.info("image_parser.parsed_payload",
                 text_units_count=len(payload.get("text_units", []) or []),
                 visual_units_count=len(payload.get("visual_units", []) or []),
                 keys=list(payload.keys()))
        for tu in payload.get("text_units", []) or []:
            raw_bbox = (tu.get("location") or {}).get("bbox")
            bbox = _coerce_bbox(raw_bbox, image_width=width, image_height=height)
            log.info("image_parser.text_unit",
                     content=tu.get("content", "")[:80],
                     raw_bbox=raw_bbox,
                     coerced_bbox=bbox,
                     role=tu.get("role"))
            lus.append(
                LUCandidate(
                    lu_type=LUType.text,
                    source_content={
                        "text": tu.get("content") or "",
                        "language": tu.get("language") or "en",
                        "font_info": tu.get("font_info"),
                    },
                    source_location=SourceLocation(
                        type="image_region",
                        bbox=bbox,
                        font_info=tu.get("font_info"),
                    ),
                    semantic_role=_ROLE_FROM_STRING.get(tu.get("role")),
                    parser_confidence=float(tu.get("confidence", 0.8)),
                    detection_metadata={"source": "openrouter" if has_openrouter else "gemini"},
                )
            )
        for vu in payload.get("visual_units", []) or []:
            bbox = _coerce_bbox((vu.get("location") or {}).get("bbox"), image_width=width, image_height=height)
            lus.append(
                LUCandidate(
                    lu_type=LUType.visual,
                    source_content={
                        "description": vu.get("description") or "",
                        "element_type": vu.get("element_type") or "prop",
                        "detected_attributes": vu.get("detected_attributes") or {},
                    },
                    source_location=SourceLocation(type="image_region", bbox=bbox),
                    semantic_role=_ROLE_FROM_STRING.get(vu.get("element_type")),
                    parser_confidence=float(vu.get("confidence", 0.8)),
                    detection_metadata={"source": "openrouter" if has_openrouter else "gemini"},
                )
            )
        for w in payload.get("parse_warnings", []) or []:
            warnings.append(str(w))

    duration_ms = int((time.monotonic() - start) * 1000)
    return ParsedResult(
        parse_method="multimodal_llm",
        parse_model_used=model_used,
        parse_confidence=0.85 if lus else None,
        parse_warnings=warnings,
        structural_metadata={
            "dimensions": {"width": width, "height": height},
            "format": fmt,
            "mime": mime_type,
            "assembly_trace_token_estimate": trace.token_estimate,
        },
        lus=lus,
        parse_duration_ms=duration_ms,
    )


def _coerce_bbox(value, *, image_width: int = 0, image_height: int = 0) -> tuple[int, int, int, int] | None:
    """Coerce a bbox value to (x, y, w, h) integer pixels.

    Handles:
      - Pixel coordinates: [100, 200, 300, 50]
      - Normalized 0..1 coordinates: [0.1, 0.2, 0.3, 0.05]
      - Mixed or malformed input
    """
    if not value:
        return None
    try:
        vals = [float(v) for v in value[:4]]
        x, y, w, h = vals

        # Detect normalized coordinates (all values between 0 and 1)
        if image_width > 0 and image_height > 0:
            all_normalized = all(0 <= v <= 1.0 for v in vals)
            if all_normalized and max(vals) <= 1.0:
                # Convert from normalized to pixel coordinates
                x = x * image_width
                y = y * image_height
                w = w * image_width
                h = h * image_height
                log.info("image_parser.bbox_denormalized",
                         original=list(vals),
                         pixel=[int(x), int(y), int(w), int(h)])

        x, y, w, h = int(round(x)), int(round(y)), int(round(w)), int(round(h))

        # Sanity check: w and h should be positive
        if w <= 0 or h <= 0:
            log.warning("image_parser.bbox_invalid_size", bbox=[x, y, w, h])
            return None

        return (x, y, w, h)
    except (TypeError, ValueError):
        return None


# ── OpenRouter vision call ──────────────────────────────────────────

def _call_openrouter_vision(prompt, data: bytes, mime_type: str) -> tuple[str | None, str]:
    """Call OpenRouter vision model with image as base64 inline data URL.

    Returns (json_string | None, model_id).

    ``parse_flattened_image`` is synchronous, but ``OpenRouterAdapter.generate``
    is async.  We spin up a throwaway event loop on a worker thread so we never
    block or conflict with the caller's running loop.
    """
    from app.prompt_assembly.trace import AssembledPrompt

    settings = get_settings()
    model_id = settings.openrouter_vision_model

    # Build a data URL for the image
    b64 = base64.b64encode(data).decode("ascii")
    data_url = f"data:{mime_type};base64,{b64}"

    # Inject the image into reference_assets so OpenRouterAdapter._user_content
    # picks it up automatically.
    vision_prompt = AssembledPrompt(
        system_prompt=prompt.system_prompt,
        user_prompt=prompt.user_prompt,
        negative_prompt=prompt.negative_prompt,
        preservation_directives=prompt.preservation_directives,
        mask_constraints=prompt.mask_constraints,
        audio_prompt=prompt.audio_prompt,
        motion_prompt=prompt.motion_prompt,
        reference_assets=[{"kind": "image", "storage_key": data_url, "mime_type": mime_type}],
        few_shot_examples=prompt.few_shot_examples,
        forced_params={
            **prompt.forced_params,
            "response_format": {"type": "json_object"},
            "temperature": 0.0,
        },
    )

    try:
        from app.ai.openrouter_adapter import OpenRouterAdapter

        adapter = OpenRouterAdapter(model=model_id, vision_mode=True)

        # Run async generate in a fresh event loop on a worker thread
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(_run_async_generate, adapter, vision_prompt)
            output = future.result(timeout=120)

        return output.text or None, model_id
    except Exception as e:  # noqa: BLE001
        log.warning("image_parser.openrouter_failed", error=str(e), model=model_id)
        return None, model_id


def _run_async_generate(adapter, prompt):
    """Run async adapter.generate() in a fresh event loop (safe from any thread)."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(adapter.generate(prompt))
    finally:
        loop.close()


# ── Legacy Gemini call ──────────────────────────────────────────────

def _call_gemini_sync(prompt, data: bytes) -> str | None:
    from google import genai  # type: ignore
    from google.genai.types import GenerateContentConfig, Part  # type: ignore

    settings = get_settings()
    client = genai.Client(api_key=settings.google_api_key)
    resp = client.models.generate_content(
        model="gemini-2.5-pro",
        contents=[
            prompt.user_prompt,
            Part.from_bytes(data=data, mime_type="image/png"),
        ],
        config=GenerateContentConfig(
            temperature=0.0,
            system_instruction=prompt.system_prompt,
            response_mime_type="application/json",
        ),
    )
    return resp.text or None
