"""Visual edit executor for flat images.

Orchestrates one Nano Banana edit per Visual LU in V1. For each LU:
  1. Build a white-on-black mask PNG sized to the source canvas.
  2. Invoke Nano Banana adapter with the assembled prompt.
  3. Verify Change Minimization via pHash outside the mask.
  4. Persist an AIGenerationLog entry.
  5. Return (new_bytes, verification_score, log_id).

If the adapter raises AIError (no key / SDK absent), we mark the edit as
pending and return the source bytes unchanged so the pipeline never blocks.
"""

from __future__ import annotations

import io
import uuid
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import AIError, get_image_adapter
from app.logging import get_logger
from app.models import AIGenerationLog
from app.models.enums import AIModel, AIStatus, ProcessingMethod
from app.prompt_assembly import PromptContext, UseCase, assemble
from app.services.change_min import DEFAULT_THRESHOLD, verify_image_minimization

log = get_logger(__name__)


@dataclass
class VisualEditResult:
    png_bytes: bytes
    verified: bool
    score: float
    ai_log_id: uuid.UUID | None
    processing_method: str
    note: str | None = None


def _build_mask(image_png_bytes: bytes, bbox: tuple[int, int, int, int]) -> bytes:
    """White rectangle on black canvas at the LU's bbox."""
    from PIL import Image, ImageDraw

    with Image.open(io.BytesIO(image_png_bytes)) as src:
        mask = Image.new("L", src.size, color=0)
        draw = ImageDraw.Draw(mask)
        x, y, w, h = bbox
        draw.rectangle([x, y, x + w, y + h], fill=255)
        buf = io.BytesIO()
        mask.save(buf, format="PNG")
        return buf.getvalue()


async def edit_visual_lu(
    session: AsyncSession,
    *,
    source_png: bytes,
    lu_output: dict,
    brand_restrictions: dict | None,
    market: str,
    sub_market: str | None,
    market_compliance: dict,
    market_culture: dict,
) -> VisualEditResult:
    strategy = lu_output.get("strategy_applied")
    source_loc = lu_output.get("source_location") or {}
    bbox_val = source_loc.get("bbox")
    if not bbox_val:
        return VisualEditResult(
            png_bytes=source_png,
            verified=False,
            score=0.0,
            ai_log_id=None,
            processing_method="pending_ai",
            note="no bbox — cannot build mask",
        )
    bbox = tuple(int(v) for v in bbox_val[:4])  # type: ignore[arg-type]

    use_case = (
        UseCase.IMAGE_ELEMENT_REMOVE
        if strategy == "replace_for_compliance" and not lu_output.get("user_instructions")
        else UseCase.IMAGE_ELEMENT_REPLACE
    )

    ctx = PromptContext(
        use_case=use_case,
        market=market,
        sub_market=sub_market,
        source_lu_id=uuid.UUID(lu_output["lu_id"]) if lu_output.get("lu_id") else None,
        source_content=lu_output.get("output_content") or {},
        source_location=source_loc,
        brand_restrictions=brand_restrictions,
        market_compliance=market_compliance,
        market_culture=market_culture,
        mask_region={"type": "bbox", "bbox": list(bbox)},
        user_instructions=lu_output.get("user_instructions"),
        strategy=strategy,
    )
    prompt, trace = assemble(ctx)

    try:
        mask_bytes = _build_mask(source_png, bbox)
        adapter = get_image_adapter()
        edit = await adapter.edit(prompt, source_image=source_png, mask_image=mask_bytes)
    except AIError as e:
        log.warning("visual_edit.adapter_unavailable", lu_id=lu_output.get("lu_id"), error=str(e))
        return VisualEditResult(
            png_bytes=source_png,
            verified=False,
            score=0.0,
            ai_log_id=None,
            processing_method="pending_ai",
            note=str(e),
        )
    except RuntimeError as e:
        # Pillow missing, etc.
        log.warning("visual_edit.runtime_error", error=str(e))
        return VisualEditResult(
            png_bytes=source_png,
            verified=False,
            score=0.0,
            ai_log_id=None,
            processing_method="pending_ai",
            note=str(e),
        )

    verification = verify_image_minimization(
        source_png, edit.image_bytes, bbox, threshold=DEFAULT_THRESHOLD
    )

    # Second-opinion visual QA. No-op if openrouter_review_model is unset.
    from app.services.review import review_image_edit

    review = await review_image_edit(
        session,
        lu_id=uuid.UUID(lu_output["lu_id"]) if lu_output.get("lu_id") else None,
        source_png=source_png,
        edited_png=edit.image_bytes,
        mask_bbox=bbox,
        target_market=market,
        sub_market=sub_market,
        brand_restrictions=brand_restrictions,
        market_compliance=market_compliance,
    )

    ai_log = AIGenerationLog(
        lu_id=uuid.UUID(lu_output["lu_id"]) if lu_output.get("lu_id") else None,
        use_case=use_case.value,
        model=AIModel.nano_banana,
        provider_model_id=edit.provider_model_id,
        assembly_trace=trace.to_dict(),
        input_hash=f"visual:{lu_output.get('lu_id')}:{market}:{sub_market}",
        output_text=None,
        cost_usd=edit.cost_usd or Decimal(0),
        status=AIStatus.success,
        verification={
            "change_minimization_score": verification.score,
            "verification_passed": verification.passed,
            "failed_regions": verification.failed_regions[:5],
            "review": review.to_dict(),
        },
        cache_hit=False,
    )
    session.add(ai_log)
    await session.flush()

    note = None
    if not verification.passed:
        note = f"ChangeBleed: score={verification.score:.3f}"
    elif review.verdict in {"revise", "fail"}:
        note = f"Review {review.verdict}: {'; '.join(review.issues[:3])}"

    return VisualEditResult(
        png_bytes=edit.image_bytes if verification.passed else source_png,
        verified=verification.passed and review.verdict != "fail",
        score=verification.score,
        ai_log_id=ai_log.id,
        processing_method=ProcessingMethod.nano_banana_edit.value,
        note=note,
    )
