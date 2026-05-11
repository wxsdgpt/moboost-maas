"""Post-generation review via a second LLM.

Two flavors:
  * ``review_translation`` — evaluates target text against the source.
  * ``review_image_edit``  — evaluates an edited image against the source.

Both are no-ops when ``openrouter_review_model`` is unset, returning a neutral
"skipped" verdict so the caller can keep going without branching.
"""

from __future__ import annotations

import base64
import json
import uuid
from dataclasses import dataclass, field
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import AIError, get_text_adapter
from app.config import get_settings
from app.logging import get_logger
from app.models import AIGenerationLog
from app.models.enums import AIModel, AIStatus
from app.prompt_assembly import PromptContext, UseCase, assemble
from app.prompt_assembly.context import ReferenceAsset

log = get_logger(__name__)


@dataclass
class ReviewResult:
    verdict: str  # "pass" | "revise" | "fail" | "skipped" | "error"
    score: float = 0.0
    issues: list[str] = field(default_factory=list)
    suggested_revision: str | None = None
    model: str | None = None
    ai_log_id: str | None = None

    def to_dict(self) -> dict:
        return {
            "verdict": self.verdict,
            "score": self.score,
            "issues": self.issues,
            "suggested_revision": self.suggested_revision,
            "model": self.model,
            "ai_log_id": self.ai_log_id,
        }


def text_review_enabled() -> bool:
    s = get_settings()
    return bool(s.openrouter_api_key and s.openrouter_text_review_model)


def image_review_enabled() -> bool:
    s = get_settings()
    return bool(s.openrouter_api_key and s.openrouter_image_review_model)


async def review_translation(
    session: AsyncSession,
    *,
    lu_id: uuid.UUID | None,
    source_text: str,
    target_text: str,
    source_language: str,
    target_market: str,
    sub_market: str | None,
    strategy: str,
    brand_restrictions: dict | None,
    brand_voice: dict | None,
    market_compliance: dict | None,
) -> ReviewResult:
    if not text_review_enabled():
        return ReviewResult(verdict="skipped")

    payload = {
        "source_language": source_language,
        "source_text": source_text,
        "target_market": sub_market or target_market,
        "target_text": target_text,
        "strategy_applied": strategy,
    }
    ctx = PromptContext(
        use_case=UseCase.TRANSLATION_REVIEW,
        market=target_market,
        sub_market=sub_market,
        source_content=payload,
        brand_restrictions=brand_restrictions,
        brand_voice=brand_voice,
        market_compliance=market_compliance,
        strategy=strategy,
    )
    prompt, trace = assemble(ctx)
    adapter = get_text_adapter(UseCase.TRANSLATION_REVIEW)

    try:
        output = await adapter.generate(prompt)
    except AIError as e:
        log.warning("review.translation.failed", error=str(e))
        return ReviewResult(verdict="error", issues=[str(e)])

    result = _parse_review(output.text)
    result.model = output.provider_model_id

    ai_log = AIGenerationLog(
        lu_id=lu_id,
        use_case=UseCase.TRANSLATION_REVIEW.value,
        model=AIModel.claude if "claude" in output.provider_model_id.lower() else AIModel.gpt_4,
        provider_model_id=output.provider_model_id,
        assembly_trace=trace.to_dict(),
        input_hash=f"review:{lu_id}:{target_market}:{sub_market}",
        output_text=output.text,
        cost_usd=output.cost_usd or Decimal(0),
        tokens_input=output.tokens_input,
        tokens_output=output.tokens_output,
        status=AIStatus.success,
        verification=result.to_dict(),
        cache_hit=False,
    )
    session.add(ai_log)
    await session.flush()
    result.ai_log_id = str(ai_log.id)
    return result


async def review_image_edit(
    session: AsyncSession,
    *,
    lu_id: uuid.UUID | None,
    source_png: bytes,
    edited_png: bytes,
    mask_bbox: tuple[int, int, int, int] | None,
    target_market: str,
    sub_market: str | None,
    brand_restrictions: dict | None,
    market_compliance: dict | None,
) -> ReviewResult:
    if not image_review_enabled():
        return ReviewResult(verdict="skipped")

    # Attach the two images as reference assets; the layer system will turn
    # them into image parts when the review adapter is invoked.
    refs = [
        ReferenceAsset(
            kind="image",
            storage_key=_inline_data_url(source_png),
            mime_type="image/png",
            metadata={"role": "source"},
        ),
        ReferenceAsset(
            kind="image",
            storage_key=_inline_data_url(edited_png),
            mime_type="image/png",
            metadata={"role": "edited"},
        ),
    ]
    ctx = PromptContext(
        use_case=UseCase.IMAGE_EDIT_REVIEW,
        market=target_market,
        sub_market=sub_market,
        source_content={
            "mask_bbox": list(mask_bbox) if mask_bbox else None,
            "target_market": sub_market or target_market,
        },
        brand_restrictions=brand_restrictions,
        market_compliance=market_compliance,
        reference_assets=refs,
    )
    prompt, trace = assemble(ctx)
    adapter = get_text_adapter(UseCase.IMAGE_EDIT_REVIEW)

    try:
        output = await adapter.generate(prompt)
    except AIError as e:
        log.warning("review.image.failed", error=str(e))
        return ReviewResult(verdict="error", issues=[str(e)])

    result = _parse_review(output.text)
    result.model = output.provider_model_id

    ai_log = AIGenerationLog(
        lu_id=lu_id,
        use_case=UseCase.IMAGE_EDIT_REVIEW.value,
        model=AIModel.gemini if "gemini" in output.provider_model_id.lower() else AIModel.gpt_4,
        provider_model_id=output.provider_model_id,
        assembly_trace=trace.to_dict(),
        input_hash=f"review-img:{lu_id}:{target_market}:{sub_market}",
        output_text=output.text,
        cost_usd=output.cost_usd or Decimal(0),
        tokens_input=output.tokens_input,
        tokens_output=output.tokens_output,
        status=AIStatus.success,
        verification=result.to_dict(),
        cache_hit=False,
    )
    session.add(ai_log)
    await session.flush()
    result.ai_log_id = str(ai_log.id)
    return result


def _parse_review(raw: str) -> ReviewResult:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return ReviewResult(verdict="error", issues=["reviewer returned non-JSON"])
    if not isinstance(data, dict):
        return ReviewResult(verdict="error", issues=["reviewer JSON not an object"])
    verdict = str(data.get("verdict", "pass")).lower()
    if verdict not in {"pass", "revise", "fail"}:
        verdict = "pass"
    return ReviewResult(
        verdict=verdict,
        score=float(data.get("score", 0) or 0),
        issues=[str(x) for x in (data.get("issues") or [])],
        suggested_revision=data.get("suggested_revision") or data.get("suggested_retry"),
    )


def _inline_data_url(data: bytes, mime: str = "image/png") -> str:
    return f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"
