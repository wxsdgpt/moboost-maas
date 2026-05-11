from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.projects import _ensure_brand_access
from app.db import get_session
from app.deps import get_current_user
from app.exporters import get_exporter
from app.exporters.registry import list_platforms
from app.models import LocalizedAsset, SourceAsset, SubMarket, User
from app.models.enums import LocalizedAssetStatus
from app.storage import get_storage

router = APIRouter()


@router.get("/platforms", response_model=list[str])
async def supported_platforms() -> list[str]:
    return list_platforms()


@router.get("/{localized_asset_id}")
async def export_asset(
    localized_asset_id: uuid.UUID,
    platform: str = Query(..., pattern=r"^(meta_ads|google_ads|dsp_generic)$"),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    asset = await session.get(LocalizedAsset, localized_asset_id)
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="localized asset not found")
    source = await session.get(SourceAsset, asset.source_asset_id)
    if source is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="orphaned asset")
    await _ensure_brand_access(session, user, source.brand_id)

    if asset.status not in (
        LocalizedAssetStatus.confirmed,
        LocalizedAssetStatus.distributed,
    ):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail=f"asset must be confirmed before export (current: {asset.status.value})",
        )
    if not asset.output_storage_key:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="asset has no output artifact yet"
        )

    sub_market = None
    if asset.target_sub_market:
        sub_market = await session.get(SubMarket, asset.target_sub_market)

    storage = get_storage()
    asset_bytes = await storage.get(asset.output_storage_key)

    exporter = get_exporter(platform)
    try:
        artifact = exporter.export(
            localized=asset,
            source=source,
            sub_market=sub_market,
            asset_bytes=asset_bytes,
            original_filename=source.original_filename,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    if asset.status is LocalizedAssetStatus.confirmed:
        asset.status = LocalizedAssetStatus.distributed
        await session.commit()

    return Response(
        content=artifact.bytes,
        media_type=artifact.content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{artifact.filename}"',
        },
    )
