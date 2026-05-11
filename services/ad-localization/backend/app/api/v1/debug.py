"""Diagnostic endpoint — inspect the latest localization pipeline state.

Hit GET /api/v1/debug/latest-job to see:
  - Latest localization job + status
  - Source asset info
  - Parsed asset + all LU details (including bbox)
  - Localized asset unit_outputs

This helps diagnose why output images may be identical to source.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_session
from app.models import (
    LocalizableUnit,
    LocalizationJob,
    LocalizedAsset,
    ParsedAsset,
    SourceAsset,
)

router = APIRouter()


@router.get("/latest-job")
async def debug_latest_job(session: AsyncSession = Depends(get_session)):
    """Return full diagnostic info for the most recent localization job."""

    # Get latest job
    job_q = await session.execute(
        select(LocalizationJob)
        .order_by(LocalizationJob.created_at.desc())
        .limit(1)
    )
    job = job_q.scalar_one_or_none()
    if job is None:
        return {"error": "no jobs found"}

    # Get source asset
    source = await session.get(SourceAsset, job.source_asset_id)

    # Get parsed asset + LUs
    parsed_q = await session.execute(
        select(ParsedAsset)
        .where(ParsedAsset.source_asset_id == source.id)
        .options(selectinload(ParsedAsset.localizable_units))
    )
    parsed = parsed_q.scalar_one_or_none()

    lus_info = []
    if parsed:
        for lu in parsed.localizable_units:
            lus_info.append({
                "id": str(lu.id),
                "lu_type": lu.lu_type.value if lu.lu_type else None,
                "source_content": lu.source_content,
                "source_location": lu.source_location,
                "has_bbox": bool((lu.source_location or {}).get("bbox")),
                "bbox": (lu.source_location or {}).get("bbox"),
                "semantic_role": lu.semantic_role.value if lu.semantic_role else None,
                "default_strategy": lu.default_strategy,
                "parser_confidence": lu.parser_confidence,
                "detection_metadata": lu.detection_metadata,
            })

    # Get localized assets for this job
    assets_q = await session.execute(
        select(LocalizedAsset)
        .where(LocalizedAsset.localization_job_id == job.id)
    )
    localized_assets = []
    for la in assets_q.scalars().all():
        localized_assets.append({
            "id": str(la.id),
            "target_market": la.target_market.value if la.target_market else None,
            "target_sub_market": la.target_sub_market,
            "status": la.status.value if la.status else None,
            "output_storage_key": la.output_storage_key,
            "unit_outputs_count": len(la.unit_outputs or []),
            "unit_outputs": [
                {
                    "lu_id": uo.get("lu_id"),
                    "strategy_applied": uo.get("strategy_applied"),
                    "processing_method": uo.get("processing_method"),
                    "has_text": bool((uo.get("output_content") or {}).get("text")),
                    "text_preview": ((uo.get("output_content") or {}).get("text") or "")[:100],
                    "source_text_preview": ((uo.get("output_content") or {}).get("source_text") or "")[:100],
                    "has_source_location": bool(uo.get("source_location")),
                    "has_bbox": bool((uo.get("source_location") or {}).get("bbox")),
                    "bbox": (uo.get("source_location") or {}).get("bbox"),
                }
                for uo in (la.unit_outputs or [])
            ],
            "platform_metadata": la.platform_metadata,
        })

    return {
        "job": {
            "id": str(job.id),
            "status": job.status.value if job.status else None,
            "target_markets": job.target_markets,
            "localization_modes": job.localization_modes,
            "strategy_matrix": job.strategy_matrix,
            "created_at": str(job.created_at) if job.created_at else None,
            "started_at": str(job.started_at) if job.started_at else None,
            "completed_at": str(job.completed_at) if job.completed_at else None,
            "error_message": job.error_message,
        },
        "source_asset": {
            "id": str(source.id) if source else None,
            "source_type": source.source_type.value if source else None,
            "storage_key": source.storage_key if source else None,
            "parse_status": source.parse_status.value if source and source.parse_status else None,
            "parse_error": source.parse_error if source else None,
        },
        "parsed_asset": {
            "exists": parsed is not None,
            "id": str(parsed.id) if parsed else None,
            "parse_method": parsed.parse_method if parsed else None,
            "parse_model_used": parsed.parse_model_used if parsed else None,
            "parse_confidence": parsed.parse_confidence if parsed else None,
            "parse_warnings": parsed.parse_warnings if parsed else None,
            "structural_metadata": parsed.structural_metadata if parsed else None,
            "lu_count": len(lus_info),
            "lus_with_bbox": sum(1 for lu in lus_info if lu["has_bbox"]),
            "text_lus": sum(1 for lu in lus_info if lu["lu_type"] == "text"),
            "text_lus_with_bbox": sum(1 for lu in lus_info if lu["lu_type"] == "text" and lu["has_bbox"]),
        },
        "localizable_units": lus_info,
        "localized_assets": localized_assets,
        "diagnosis": _diagnose(lus_info, localized_assets),
    }


def _diagnose(lus: list[dict], assets: list[dict]) -> list[str]:
    """Produce human-readable diagnosis of common issues."""
    issues = []

    if not lus:
        issues.append("NO_LUS: Vision model returned zero localizable units. Check image_parser logs.")
        return issues

    text_lus = [lu for lu in lus if lu["lu_type"] == "text"]
    if not text_lus:
        issues.append("NO_TEXT_LUS: Parser found units but none are text type.")

    text_lus_no_bbox = [lu for lu in text_lus if not lu["has_bbox"]]
    if text_lus_no_bbox:
        issues.append(
            f"MISSING_BBOX: {len(text_lus_no_bbox)}/{len(text_lus)} text LUs have no bbox. "
            "Vision model may not be returning bounding box coordinates."
        )

    text_lus_no_strategy = [lu for lu in text_lus if not lu["default_strategy"]]
    if text_lus_no_strategy:
        issues.append(
            f"NO_DEFAULT_STRATEGY: {len(text_lus_no_strategy)} text LUs have no default_strategy. "
            "They will be skipped by the orchestrator."
        )

    for asset in assets:
        if not asset.get("unit_outputs"):
            issues.append(
                f"EMPTY_OUTPUTS ({asset['target_market']}): Localized asset has zero unit_outputs. "
                "All LUs were skipped or translation failed."
            )
            continue
        outputs_with_text = [uo for uo in asset["unit_outputs"] if uo["has_text"]]
        outputs_with_bbox = [uo for uo in asset["unit_outputs"] if uo["has_bbox"]]
        if outputs_with_text and not outputs_with_bbox:
            issues.append(
                f"TEXT_NO_BBOX ({asset['target_market']}): {len(outputs_with_text)} outputs have translated text "
                f"but 0 have bbox. Text overlay will be EMPTY — image unchanged!"
            )

    if not issues:
        issues.append("OK: All checks passed. Text LUs have bbox and translated text.")

    return issues
