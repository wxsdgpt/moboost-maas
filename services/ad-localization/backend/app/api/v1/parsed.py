from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.projects import _ensure_brand_access
from app.db import get_session
from app.deps import get_current_user
from app.models import LocalizableUnit, ParsedAsset, SourceAsset, User
from app.schemas.parsed import LUOut, ParsedAssetDetail, ParsedAssetOut
from app.services.parse import parse_and_persist

router = APIRouter()


@router.post("/source/{source_asset_id}/parse", response_model=ParsedAssetOut)
async def parse_now(
    source_asset_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ParsedAsset:
    """Force a synchronous parse (useful for dev / retry flows)."""
    asset = await session.get(SourceAsset, source_asset_id)
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="asset not found")
    await _ensure_brand_access(session, user, asset.brand_id)
    return await parse_and_persist(session, source_asset_id)


@router.get("/source/{source_asset_id}", response_model=ParsedAssetDetail)
async def get_parsed_for_source(
    source_asset_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ParsedAsset:
    asset = await session.get(SourceAsset, source_asset_id)
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="asset not found")
    await _ensure_brand_access(session, user, asset.brand_id)

    result = await session.execute(
        select(ParsedAsset)
        .where(ParsedAsset.source_asset_id == source_asset_id)
        .options(selectinload(ParsedAsset.localizable_units))
    )
    parsed = result.scalar_one_or_none()
    if parsed is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail="no parsed asset yet — wait for the worker or POST /parse",
        )
    return parsed


@router.get("/{parsed_id}/lus", response_model=list[LUOut])
async def list_lus(
    parsed_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[LocalizableUnit]:
    parsed = await session.get(ParsedAsset, parsed_id)
    if parsed is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="parsed asset not found")
    asset = await session.get(SourceAsset, parsed.source_asset_id)
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="orphaned parsed asset")
    await _ensure_brand_access(session, user, asset.brand_id)

    result = await session.execute(
        select(LocalizableUnit)
        .where(LocalizableUnit.parsed_asset_id == parsed_id)
        .order_by(LocalizableUnit.created_at)
    )
    return list(result.scalars().all())
