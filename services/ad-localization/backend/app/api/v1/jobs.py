from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.projects import _ensure_brand_access
from app.config import get_settings
from app.db import get_session
from app.deps import get_current_user
from app.logging import get_logger
from app.models import ComplianceCheckReport, LocalizationJob, LocalizedAsset, SourceAsset, User
from app.models.enums import JobStatus
from app.schemas.job import JobCreate, JobOut, MatrixCellUpdate, MatrixView
from app.schemas.localized import LocalizedAssetDetail, LocalizedAssetSummary
from app.services.job import build_matrix_view, create_job_with_defaults, update_cell
from app.services.strategy_resolver import LocalizationTarget
from app.tasks import run_localization_job

log = get_logger(__name__)

router = APIRouter()


@router.get("", response_model=list[JobOut])
async def list_jobs(
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    limit: int = 50,
    offset: int = 0,
) -> list[LocalizationJob]:
    """List all localization jobs for the current user."""
    result = await session.execute(
        select(LocalizationJob)
        .where(LocalizationJob.requested_by == user.id)
        .order_by(LocalizationJob.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


@router.post("", response_model=JobOut, status_code=201)
async def create_job(
    payload: JobCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> LocalizationJob:
    asset = await session.get(SourceAsset, payload.source_asset_id)
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="source asset not found")
    await _ensure_brand_access(session, user, asset.brand_id)

    try:
        job = await create_job_with_defaults(
            session,
            source_asset_id=payload.source_asset_id,
            requested_by=user.id,
            targets=[
                LocalizationTarget(market=t.market.value, sub_market=t.sub_market)
                for t in payload.targets
            ],
        )
    except LookupError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    await session.commit()
    await session.refresh(job)
    return job


@router.get("/{job_id}", response_model=JobOut)
async def get_job(
    job_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> LocalizationJob:
    job = await session.get(LocalizationJob, job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="job not found")
    asset = await session.get(SourceAsset, job.source_asset_id)
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="source asset not found")
    await _ensure_brand_access(session, user, asset.brand_id)
    return job


@router.get("/{job_id}/matrix", response_model=MatrixView)
async def get_matrix(
    job_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> dict:
    job = await session.get(LocalizationJob, job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="job not found")
    asset = await session.get(SourceAsset, job.source_asset_id)
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="source asset not found")
    await _ensure_brand_access(session, user, asset.brand_id)
    try:
        return await build_matrix_view(session, job)
    except LookupError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e)) from e


@router.patch("/{job_id}/matrix/cell", response_model=MatrixView)
async def patch_cell(
    job_id: uuid.UUID,
    payload: MatrixCellUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> dict:
    job = await session.get(LocalizationJob, job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="job not found")
    if job.status not in (JobStatus.draft, JobStatus.failed):
        raise HTTPException(status.HTTP_409_CONFLICT, detail=f"job is {job.status.value}")

    asset = await session.get(SourceAsset, job.source_asset_id)
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="source asset not found")
    await _ensure_brand_access(session, user, asset.brand_id)

    try:
        update_cell(
            job,
            lu_id=payload.lu_id,
            target=payload.target,
            strategy=payload.strategy,
            user_instructions=payload.user_instructions,
            user_provided_content=payload.user_provided_content,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    await session.commit()
    return await build_matrix_view(session, job)


@router.get("/{job_id}/localized", response_model=list[LocalizedAssetSummary])
async def list_localized(
    job_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[LocalizedAsset]:
    job = await session.get(LocalizationJob, job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="job not found")
    asset = await session.get(SourceAsset, job.source_asset_id)
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="source asset missing")
    await _ensure_brand_access(session, user, asset.brand_id)
    result = await session.execute(
        select(LocalizedAsset)
        .where(LocalizedAsset.localization_job_id == job_id)
        .order_by(LocalizedAsset.target_market, LocalizedAsset.target_sub_market)
    )
    return list(result.scalars().all())


@router.get("/localized/{localized_id}", response_model=LocalizedAssetDetail)
async def get_localized(
    localized_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> LocalizedAsset:
    asset = await session.get(LocalizedAsset, localized_id)
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="localized asset not found")
    source = await session.get(SourceAsset, asset.source_asset_id)
    if source is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="orphaned asset")
    await _ensure_brand_access(session, user, source.brand_id)
    return asset


@router.get("/localized/{localized_id}/download")
async def download_localized(
    localized_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
):
    """Download the composed output file for a localized asset."""
    from fastapi.responses import Response

    from app.storage import get_storage

    asset = await session.get(LocalizedAsset, localized_id)
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="localized asset not found")
    source = await session.get(SourceAsset, asset.source_asset_id)
    if source is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="orphaned asset")
    await _ensure_brand_access(session, user, source.brand_id)

    if not asset.output_storage_key:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="no output file available")

    storage = get_storage()
    try:
        data = await storage.get(asset.output_storage_key)
    except FileNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="output file not found in storage")

    # Determine content type from the storage key extension
    ext = asset.output_storage_key.rsplit(".", 1)[-1].lower() if "." in asset.output_storage_key else "png"
    mime_map = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "mp4": "video/mp4",
                "txt": "text/plain", "md": "text/markdown", "csv": "text/csv"}
    content_type = mime_map.get(ext, "application/octet-stream")

    filename = f"{asset.target_market.value}_{localized_id}.{ext}"
    return Response(
        content=data,
        media_type=content_type,
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.post("/{job_id}/submit", response_model=JobOut)
async def submit_job(
    job_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> LocalizationJob:
    job = await session.get(LocalizationJob, job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="job not found")
    if job.status not in (JobStatus.draft, JobStatus.failed):
        raise HTTPException(status.HTTP_409_CONFLICT, detail=f"job is {job.status.value}")
    asset = await session.get(SourceAsset, job.source_asset_id)
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="source asset not found")
    await _ensure_brand_access(session, user, asset.brand_id)

    job.status = JobStatus.queued
    await session.commit()
    try:
        await run_localization_job.defer_async(job_id=str(job.id))
    except Exception:
        if get_settings().is_dev:
            log.warning("procrastinate unavailable — running job inline",
                        job_id=str(job.id))
            from app.db import SessionLocal
            from app.services.orchestrator import run_job
            async with SessionLocal() as s:
                await run_job(s, job.id)
        else:
            raise
    await session.refresh(job)
    return job


@router.get("/{job_id}/compliance")
async def get_job_compliance(
    job_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> dict:
    """Get compliance reports for all localized assets in a job."""
    job = await session.get(LocalizationJob, job_id)
    if job is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="job not found")
    asset = await session.get(SourceAsset, job.source_asset_id)
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="source asset not found")
    await _ensure_brand_access(session, user, asset.brand_id)

    # Get all localized assets for the job
    localized_result = await session.execute(
        select(LocalizedAsset)
        .where(LocalizedAsset.localization_job_id == job_id)
    )
    localized_assets = list(localized_result.scalars().all())

    # Get compliance reports for each localized asset
    reports = []
    for la in localized_assets:
        report_result = await session.execute(
            select(ComplianceCheckReport)
            .where(ComplianceCheckReport.localized_asset_id == la.id)
            .order_by(ComplianceCheckReport.created_at.desc())
            .limit(1)
        )
        report = report_result.scalar_one_or_none()
        if report:
            reports.append({
                "id": str(report.id),
                "localized_asset_id": str(la.id),
                "market": la.target_market.value if hasattr(la.target_market, 'value') else la.target_market,
                "sub_market": la.target_sub_market,
                "overall_status": report.overall_status,
                "findings": report.findings or [],
                "created_at": report.created_at.isoformat() if report.created_at else None,
            })

    return {"reports": reports}
