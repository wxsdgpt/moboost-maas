from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    Brand,
    LocalizableUnit,
    LocalizationJob,
    ParsedAsset,
    SourceAsset,
)
from app.models.enums import JobStatus
from app.services.strategy_resolver import (
    LocalizationTarget,
    build_matrix,
)


def _composite_tag(market: str, sub_market: str | None) -> str:
    return sub_market or market


async def create_job_with_defaults(
    session: AsyncSession,
    *,
    source_asset_id: uuid.UUID,
    requested_by: uuid.UUID | None,
    targets: list[LocalizationTarget],
) -> LocalizationJob:
    # Load parsed asset + LUs + brand
    asset = await session.get(SourceAsset, source_asset_id)
    if asset is None:
        raise LookupError("source asset not found")
    parsed_result = await session.execute(
        select(ParsedAsset)
        .where(ParsedAsset.source_asset_id == source_asset_id)
        .options(selectinload(ParsedAsset.localizable_units))
    )
    parsed = parsed_result.scalar_one_or_none()

    brand = await session.get(Brand, asset.brand_id)

    # If parse hasn't completed or failed, build matrix with whatever LUs exist (may be empty)
    lus = list(parsed.localizable_units) if parsed else []
    matrix = build_matrix(lus, targets, brand)

    # Strategy matrix shape per DATA_MODELS.md: { lu_id: { market_tag: { strategy, ... } } }
    strategy_matrix: dict = {
        lu_id: {tag: {"strategy": strat} for tag, strat in row.items()}
        for lu_id, row in matrix.items()
    }

    job = LocalizationJob(
        source_asset_id=source_asset_id,
        requested_by=requested_by,
        target_markets=[_composite_tag(t.market, t.sub_market) for t in targets],
        strategy_matrix=strategy_matrix,
        status=JobStatus.draft,
    )
    session.add(job)
    await session.flush()
    return job


async def build_matrix_view(
    session: AsyncSession, job: LocalizationJob
) -> dict:
    asset = await session.get(SourceAsset, job.source_asset_id)
    if asset is None:
        raise LookupError("source asset not found for job")

    parsed_result = await session.execute(
        select(ParsedAsset)
        .where(ParsedAsset.source_asset_id == job.source_asset_id)
        .options(selectinload(ParsedAsset.localizable_units))
    )
    parsed = parsed_result.scalar_one_or_none()

    targets = list(job.target_markets)
    rows: list[dict] = []
    lus = parsed.localizable_units if parsed else []
    for lu in lus:
        cells: dict[str, dict] = {}
        per_market = job.strategy_matrix.get(str(lu.id), {}) or {}
        for tag in targets:
            cell = per_market.get(tag) or {"strategy": lu.default_strategy}
            cells[tag] = cell
        rows.append(
            {
                "lu_id": str(lu.id),
                "lu_type": lu.lu_type.value,
                "semantic_role": lu.semantic_role.value if lu.semantic_role else None,
                "is_locked": lu.is_locked,
                "preview": _lu_preview(lu),
                "parser_confidence": float(lu.parser_confidence) if lu.parser_confidence else None,
                "cells": cells,
            }
        )
    return {"job_id": str(job.id), "targets": targets, "rows": rows}


def _lu_preview(lu: LocalizableUnit) -> str:
    if lu.lu_type.value == "text":
        return (lu.source_content.get("text") or "")[:200]
    if lu.lu_type.value == "visual":
        return lu.source_content.get("description") or ""
    if lu.lu_type.value == "audio":
        return lu.source_content.get("transcript") or lu.source_content.get("audio_type") or ""
    return ""


def update_cell(
    job: LocalizationJob,
    *,
    lu_id: uuid.UUID,
    target: str,
    strategy: str,
    user_instructions: str | None,
    user_provided_content: str | None,
) -> None:
    if target not in job.target_markets:
        raise ValueError(f"target {target} is not in this job")
    matrix = dict(job.strategy_matrix or {})
    row = dict(matrix.get(str(lu_id), {}) or {})
    cell = {"strategy": strategy}
    if user_instructions is not None:
        cell["user_instructions"] = user_instructions
    if user_provided_content is not None:
        cell["user_provided_content"] = user_provided_content
    row[target] = cell
    matrix[str(lu_id)] = row
    job.strategy_matrix = matrix
