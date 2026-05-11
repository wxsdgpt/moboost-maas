"""Glue: load source asset bytes, invoke parser, persist ParsedAsset + LUs."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.logging import get_logger
from app.models import (
    ComplianceUnit,
    LocalizableUnit,
    ParsedAsset,
    SourceAsset,
)
from app.models.enums import LUType, ParseStatus
from app.parsers import parse_bytes
from app.parsers.base import ParsedResult
from app.storage import get_storage

# Default strategies per LU type (used when no matrix override exists)
_DEFAULT_STRATEGY = {
    LUType.text: "light_localize",
    LUType.visual: "keep_original",
    LUType.audio: "keep_original",
}

log = get_logger(__name__)


async def parse_and_persist(session: AsyncSession, source_asset_id: uuid.UUID) -> ParsedAsset:
    asset = await session.get(SourceAsset, source_asset_id)
    if asset is None:
        raise LookupError(f"source asset {source_asset_id} not found")

    storage = get_storage()
    data = await storage.get(asset.storage_key)

    asset.parse_status = ParseStatus.parsing
    asset.parse_error = None
    await session.flush()

    try:
        result: ParsedResult = parse_bytes(asset.source_type, data)
    except Exception as e:  # noqa: BLE001
        asset.parse_status = ParseStatus.failed
        asset.parse_error = str(e)[:4000]
        await session.commit()
        log.error("parse.failed", source_asset_id=str(source_asset_id), error=str(e))
        raise

    parsed = ParsedAsset(
        source_asset_id=asset.id,
        parse_method=result.parse_method,
        parse_model_used=result.parse_model_used,
        parse_confidence=result.parse_confidence,
        parse_warnings=result.parse_warnings,
        structural_metadata=result.structural_metadata,
        parse_duration_ms=result.parse_duration_ms,
        parsed_at=datetime.now(timezone.utc),
    )
    session.add(parsed)
    await session.flush()

    for cand in result.lus:
        lu = LocalizableUnit(
            parsed_asset_id=parsed.id,
            lu_type=cand.lu_type,
            source_content=cand.source_content,
            source_location={
                "type": cand.source_location.type,
                "psd_layer_id": cand.source_location.psd_layer_id,
                "bbox": list(cand.source_location.bbox) if cand.source_location.bbox else None,
                "time_range": list(cand.source_location.time_range)
                if cand.source_location.time_range
                else None,
                "field_name": cand.source_location.field_name,
                "font_info": cand.source_location.font_info,
                "style_info": cand.source_location.style_info,
                "mask_key": cand.source_location.mask_key,
            },
            semantic_role=cand.semantic_role,
            default_strategy=_DEFAULT_STRATEGY.get(cand.lu_type),
            is_locked=cand.is_locked,
            max_length_constraint=cand.max_length_constraint,
            parser_confidence=cand.parser_confidence,
            detection_metadata=cand.detection_metadata,
        )
        session.add(lu)
        log.info(
            "parse.lu_created",
            lu_type=cand.lu_type.value,
            has_bbox=bool(cand.source_location.bbox),
            bbox=list(cand.source_location.bbox) if cand.source_location.bbox else None,
            content_preview=str(cand.source_content)[:100],
        )

    for cunit in result.compliance_candidates:
        session.add(
            ComplianceUnit(
                parsed_asset_id=parsed.id,
                element_type=cunit.element_type,
                market_content=cunit.market_content,
                placement_strategy=cunit.placement_strategy,
            )
        )

    asset.parse_status = ParseStatus.parsed
    asset.file_metadata = {**asset.file_metadata, **result.structural_metadata}
    await session.commit()
    log.info(
        "parse.done",
        source_asset_id=str(source_asset_id),
        lu_count=len(result.lus),
        method=result.parse_method,
    )
    return parsed
