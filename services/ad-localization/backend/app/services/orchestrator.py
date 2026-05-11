"""Top-level localization orchestrator.

Input: LocalizationJob in status=queued.
Output: one LocalizedAsset per target (market, sub_market?) with:
  - output bytes persisted to storage
  - unit_outputs JSON capturing per-LU processing
  - platform_metadata populated (overlays / distribution)
  - compliance check run and report written
  - status=awaiting_confirmation

Non-fatal errors per target are recorded on the LocalizedAsset; the job status
becomes `partial` if any target fails. The pipeline never throws up to the
worker unless the entire job setup is invalid (missing source / parsed asset).
"""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.logging import get_logger
from app.models import (
    Brand,
    LocalizableUnit,
    LocalizationJob,
    LocalizedAsset,
    ParsedAsset,
    Project,
    SourceAsset,
    SubMarket,
)
from app.models.enums import (
    JobStatus,
    LocalizedAssetStatus,
    Market,
    OperationalStatus,
)
from app.services.apply_lu import ApplyContext, apply_lu
from app.services.compliance_check import run_check
from app.services.compose_output import compose_async
from app.services.market_context import build_market_compliance_for, market_culture_for
from app.services.source_asset import build_storage_key
from app.storage import get_storage

log = get_logger(__name__)


async def run_job(session: AsyncSession, job_id: uuid.UUID) -> LocalizationJob:
    job = await session.get(LocalizationJob, job_id)
    if job is None:
        raise LookupError(f"job {job_id} not found")

    source = await session.get(SourceAsset, job.source_asset_id)
    if source is None:
        raise LookupError(f"source asset {job.source_asset_id} missing")

    parsed_q = await session.execute(
        select(ParsedAsset)
        .where(ParsedAsset.source_asset_id == source.id)
        .options(selectinload(ParsedAsset.localizable_units))
    )
    parsed = parsed_q.scalar_one_or_none()
    if parsed is None:
        # Parse failed or never ran — mark job completed with empty results
        log.warning("run_job.no_parsed_asset", job_id=str(job_id),
                     source_asset_id=str(source.id))
        job.status = JobStatus.completed
        job.started_at = datetime.now(timezone.utc)
        job.completed_at = datetime.now(timezone.utc)
        job.error_message = "Source asset parsing failed or was skipped — no localizable units found."
        await session.commit()
        return

    brand = await session.get(Brand, source.brand_id)
    project = await session.get(Project, source.project_id)
    storage = get_storage()
    source_bytes = await storage.get(source.storage_key)

    job.status = JobStatus.processing
    job.started_at = datetime.now(timezone.utc)
    await session.commit()

    any_failed = False

    for target_tag in job.target_markets:
        market, sub_market_id = _split_target_tag(target_tag)
        sub_market = None
        if sub_market_id:
            sub_market = await session.get(SubMarket, sub_market_id)
        else:
            sub_market = await session.get(SubMarket, market) or None

        if sub_market and sub_market.operational_status is OperationalStatus.blocked:
            _record_skipped(session, job=job, source=source, market=market, sub_market_id=sub_market_id, reason="blocked_sub_market")
            continue

        try:
            await _localize_for_target(
                session,
                job=job,
                source=source,
                source_bytes=source_bytes,
                parsed=parsed,
                brand=brand,
                project=project,
                sub_market=sub_market,
                market=market,
                sub_market_id=sub_market_id,
            )
        except Exception as e:  # noqa: BLE001
            any_failed = True
            log.exception("orchestrator.target_failed", target=target_tag)
            _record_failed(
                session,
                job=job,
                source=source,
                market=market,
                sub_market_id=sub_market_id,
                error=str(e),
            )

    job.completed_at = datetime.now(timezone.utc)
    job.status = JobStatus.partial if any_failed else JobStatus.completed
    await session.commit()
    return job


# ---------- per target -----------------------------------------------------

async def _localize_for_target(
    session: AsyncSession,
    *,
    job: LocalizationJob,
    source: SourceAsset,
    source_bytes: bytes,
    parsed: ParsedAsset,
    brand: Brand | None,
    project: Project | None,
    sub_market: SubMarket | None,
    market: str,
    sub_market_id: str | None,
) -> LocalizedAsset:
    market_compliance, effective_rules = await build_market_compliance_for(
        session,
        brand_id=source.brand_id,
        market=market,
        sub_market=sub_market_id,
    )
    culture = market_culture_for(market)

    modes = job.localization_modes or {}
    language_on = bool(modes.get("language", True))
    compliance_on = bool(modes.get("compliance", True))
    element_replace_on = bool(modes.get("element_replace", True))

    ctx = ApplyContext(
        market=market,
        sub_market=sub_market_id,
        brand=brand,
        market_compliance=market_compliance,
        market_culture=culture,
        campaign_prompt_additions=(project.prompt_additions if project else "") or "",
        language=language_on,
        compliance=compliance_on,
        element_replace=element_replace_on,
    )

    # Build strategy row for this target: fall back to LU default_strategy if
    # a cell is missing (job created pre-matrix-edit for example).
    target_tag = sub_market_id or market
    matrix_row = job.strategy_matrix or {}

    unit_outputs: list[dict] = []
    for lu in parsed.localizable_units:
        cell = _pick_cell(matrix_row, lu.id, target_tag, fallback=lu.default_strategy)
        strategy = cell.get("strategy") if cell else lu.default_strategy
        if not strategy:
            log.warning("orchestrator.lu_skipped_no_strategy",
                        lu_id=str(lu.id),
                        lu_type=lu.lu_type.value,
                        target=target_tag,
                        default_strategy=lu.default_strategy)
            continue
        out = await apply_lu(
            session,
            lu=lu,
            strategy=strategy,
            user_instructions=(cell or {}).get("user_instructions"),
            user_provided_content=(cell or {}).get("user_provided_content"),
            ctx=ctx,
        )
        # Preserve the source location so the composer can reach PSD layers.
        out["source_location"] = lu.source_location
        log.info("orchestrator.lu_processed",
                 lu_id=str(lu.id),
                 lu_type=lu.lu_type.value,
                 strategy=strategy,
                 has_bbox=bool((lu.source_location or {}).get("bbox")),
                 bbox=(lu.source_location or {}).get("bbox"),
                 output_text=(out.get("output_content") or {}).get("text", "")[:60])
        unit_outputs.append(out)

    log.info("orchestrator.unit_outputs_summary",
             market=market,
             total_lus=len(parsed.localizable_units),
             total_outputs=len(unit_outputs),
             outputs_with_bbox=sum(1 for o in unit_outputs if (o.get("source_location") or {}).get("bbox")))

    # Compose final bytes + overlay
    if sub_market is None:
        # Federal-only markets store their single row under id==market (e.g. 'DE')
        sub_market = await session.get(SubMarket, market)
    if sub_market is None:
        raise LookupError(f"sub-market config missing for {market}")

    composed = await compose_async(
        session,
        source_bytes=source_bytes,
        source_type=source.source_type,
        unit_outputs=unit_outputs,
        sub_market=sub_market,
        brand_restrictions=(brand.restrictions if brand else None),
        market=market,
        sub_market_id=sub_market_id,
        market_compliance=market_compliance,
        market_culture=culture,
        apply_compliance_overlays=compliance_on,
    )

    # Persist the output asset
    storage = get_storage()
    asset_id = uuid.uuid4()
    storage_key = _output_key(source, asset_id, composed.extension)
    await storage.put(storage_key, composed.bytes, content_type=composed.mime)

    platform_metadata = _platform_metadata(sub_market, composed.overlay_flags)

    localized = LocalizedAsset(
        id=asset_id,
        localization_job_id=job.id,
        source_asset_id=source.id,
        target_market=Market(market),
        target_sub_market=sub_market_id,
        output_storage_key=storage_key,
        output_file_hash=composed.file_hash,
        unit_outputs=unit_outputs,
        compliance_overlay_applied=bool(composed.overlay_flags),
        platform_metadata=platform_metadata,
        status=LocalizedAssetStatus.compliance_checking,
    )
    session.add(localized)
    await session.flush()

    # Compliance check only runs when that mode is enabled.
    if compliance_on:
        try:
            await run_check(session, localized.id)
        except Exception as e:  # noqa: BLE001
            log.warning(
                "orchestrator.compliance_check_failed",
                asset=str(localized.id),
                error=str(e),
            )
    else:
        localized.status = LocalizedAssetStatus.awaiting_confirmation

    await session.flush()
    return localized


# ---------- helpers --------------------------------------------------------

def _split_target_tag(tag: str) -> tuple[str, str | None]:
    """'US-NJ' → ('US', 'US-NJ'); 'DE' → ('DE', None)."""
    if "-" in tag and tag.split("-", 1)[0] in {m.value for m in Market}:
        return tag.split("-", 1)[0], tag
    return tag, None


def _pick_cell(
    matrix: dict, lu_id: uuid.UUID, target_tag: str, fallback: str | None
) -> dict | None:
    row = matrix.get(str(lu_id)) or {}
    cell = row.get(target_tag)
    if cell:
        return cell
    if fallback:
        return {"strategy": fallback}
    return None


def _output_key(source: SourceAsset, asset_id: uuid.UUID, extension: str) -> str:
    return f"output/{source.brand_id}/{source.project_id}/{asset_id}{extension}"


def _platform_metadata(sub_market: SubMarket, overlay_flags: dict) -> dict:
    """Per sub-market: time windows (DE), state geo-targets (US/NG), overlay flags."""
    meta: dict = {"overlays": overlay_flags}
    parent = sub_market.parent_market.value

    if parent == "DE":
        meta["allowed_time_windows"] = [21, 6]
    if parent == "US" and sub_market.region_code:
        meta["allowed_sub_regions"] = [sub_market.region_code]
    if parent == "NG" and sub_market.region_code:
        meta["allowed_sub_regions"] = [sub_market.region_code]
    if parent == "IN":
        from app.seed.markets import IN_BLOCKLIST_CONFIG

        meta["blocked_sub_regions"] = [
            s["code"] for s in IN_BLOCKLIST_CONFIG["blocklist_states"]
        ] + [
            s["code"] for s in IN_BLOCKLIST_CONFIG["volatile_states"] if s.get("current_default") == "block"
        ]
        meta["blocked_sub_regions_reason"] = "local_law_prohibition"
    if parent == "UK":
        if sub_market.id == "UK-GB":
            meta["allowed_sub_regions"] = ["GB-ENG", "GB-SCT", "GB-WLS"]
        elif sub_market.id == "UK-NI":
            meta["allowed_sub_regions"] = ["GB-NIR"]
    if parent == "NG":
        meta["excludes_sensitive_sites"] = True

    return meta


def _record_skipped(
    session: AsyncSession,
    *,
    job: LocalizationJob,
    source: SourceAsset,
    market: str,
    sub_market_id: str | None,
    reason: str,
) -> None:
    session.add(
        LocalizedAsset(
            id=uuid.uuid4(),
            localization_job_id=job.id,
            source_asset_id=source.id,
            target_market=Market(market),
            target_sub_market=sub_market_id,
            output_storage_key=None,
            output_file_hash=None,
            unit_outputs=[],
            compliance_overlay_applied=False,
            platform_metadata={"skipped_reason": reason},
            status=LocalizedAssetStatus.draft,
        )
    )


def _record_failed(
    session: AsyncSession,
    *,
    job: LocalizationJob,
    source: SourceAsset,
    market: str,
    sub_market_id: str | None,
    error: str,
) -> None:
    session.add(
        LocalizedAsset(
            id=uuid.uuid4(),
            localization_job_id=job.id,
            source_asset_id=source.id,
            target_market=Market(market),
            target_sub_market=sub_market_id,
            output_storage_key=None,
            output_file_hash=None,
            unit_outputs=[],
            compliance_overlay_applied=False,
            platform_metadata={"error": error[:2000]},
            status=LocalizedAssetStatus.draft,
        )
    )
