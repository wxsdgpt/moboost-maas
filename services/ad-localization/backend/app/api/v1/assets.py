from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.projects import _ensure_brand_access
from app.config import get_settings
from app.db import get_session
from app.deps import get_current_user
from app.logging import get_logger
from app.models import Project, SourceAsset, User
from app.schemas.source_asset import SourceAssetListItem, SourceAssetOut
from app.services.source_asset import create_source_asset
from app.tasks import parse_source_asset

log = get_logger(__name__)


async def _enqueue_or_inline_parse(asset_id: uuid.UUID) -> None:
    """Queue parse task via procrastinate, or run inline in dev mode.

    Errors are logged but never propagated — the upload must succeed
    even if the parse fails (parse_status stays 'failed' in the DB).
    """
    try:
        await parse_source_asset.defer_async(source_asset_id=str(asset_id))
    except Exception:
        if get_settings().is_dev:
            log.warning("procrastinate unavailable — running parse inline",
                        asset_id=str(asset_id))
            from app.db import SessionLocal
            from app.services.parse import parse_and_persist
            try:
                async with SessionLocal() as s:
                    await parse_and_persist(s, asset_id)
            except Exception as parse_err:
                log.error("inline parse failed (non-fatal for upload)",
                          asset_id=str(asset_id), error=str(parse_err))
        else:
            log.error("procrastinate unavailable and not in dev mode",
                      asset_id=str(asset_id))
            raise


class TextUploadIn(BaseModel):
    project_id: uuid.UUID
    content: str = Field(min_length=1, max_length=200_000)
    filename: str | None = Field(default=None, max_length=200)
    format: str = Field(default="txt", pattern=r"^(txt|md|csv)$")
    tags: list[str] = Field(default_factory=list)

router = APIRouter()

MAX_UPLOAD_BYTES = 500 * 1024 * 1024  # 500 MB hard cap in V1


@router.post("/upload", response_model=SourceAssetOut, status_code=201)
async def upload_asset(
    project_id: uuid.UUID = Form(...),
    tags: str | None = Form(default=None),
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> SourceAsset:
    project = await session.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="project not found")
    await _ensure_brand_access(session, user, project.brand_id)

    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="file too large")
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="empty file")

    try:
        asset = await create_source_asset(
            session,
            brand_id=project.brand_id,
            project_id=project_id,
            uploaded_by=user.id,
            original_filename=file.filename or "unnamed",
            data=data,
            tags=[t.strip() for t in (tags or "").split(",") if t.strip()],
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    await session.commit()

    # enqueue async parse (runs inline in dev mode if procrastinate is unavailable)
    await _enqueue_or_inline_parse(asset.id)
    return asset


@router.post("/upload-text", response_model=SourceAssetOut, status_code=201)
async def upload_text(
    payload: TextUploadIn,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> SourceAsset:
    project = await session.get(Project, payload.project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="project not found")
    await _ensure_brand_access(session, user, project.brand_id)

    ext = {"txt": ".txt", "md": ".md", "csv": ".csv"}[payload.format]
    filename = payload.filename or f"pasted-{uuid.uuid4().hex[:8]}{ext}"
    if not filename.lower().endswith(ext):
        filename = filename + ext
    data = payload.content.encode("utf-8")

    try:
        asset = await create_source_asset(
            session,
            brand_id=project.brand_id,
            project_id=payload.project_id,
            uploaded_by=user.id,
            original_filename=filename,
            data=data,
            tags=payload.tags,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    await session.commit()
    await _enqueue_or_inline_parse(asset.id)
    return asset


class UrlIngestIn(BaseModel):
    """Ingest an asset from a URL (e.g. from moboost-maas storage)."""
    url: str = Field(min_length=1, max_length=4096)
    project_id: uuid.UUID
    filename: str | None = Field(default=None, max_length=200)
    tags: list[str] = Field(default_factory=list)


@router.post("/from-url", response_model=SourceAssetOut, status_code=201)
async def ingest_from_url(
    payload: UrlIngestIn,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> SourceAsset:
    """Download an asset from a URL and create a source asset."""
    import httpx
    from urllib.parse import urlparse

    project = await session.get(Project, payload.project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="project not found")
    await _ensure_brand_access(session, user, project.brand_id)

    # Download the file
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(payload.url)
            resp.raise_for_status()
            data = resp.content
    except httpx.HTTPError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"failed to fetch URL: {e}") from e

    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="file too large")
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="empty response from URL")

    # Derive filename from URL if not provided
    filename = payload.filename or urlparse(payload.url).path.split("/")[-1] or "downloaded"

    try:
        asset = await create_source_asset(
            session,
            brand_id=project.brand_id,
            project_id=payload.project_id,
            uploaded_by=user.id,
            original_filename=filename,
            data=data,
            tags=payload.tags,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    await session.commit()
    await _enqueue_or_inline_parse(asset.id)
    return asset


@router.get("", response_model=list[SourceAssetListItem])
async def list_assets(
    project_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    limit: int = 50,
    offset: int = 0,
) -> list[SourceAsset]:
    project = await session.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="project not found")
    await _ensure_brand_access(session, user, project.brand_id)

    result = await session.execute(
        select(SourceAsset)
        .where(SourceAsset.project_id == project_id)
        .order_by(SourceAsset.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


@router.get("/{asset_id}", response_model=SourceAssetOut)
async def get_asset(
    asset_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> SourceAsset:
    asset = await session.get(SourceAsset, asset_id)
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="asset not found")
    await _ensure_brand_access(session, user, asset.brand_id)
    return asset
