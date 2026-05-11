from __future__ import annotations

import uuid
from dataclasses import asdict
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.projects import _ensure_brand_access
from app.db import get_session
from app.deps import get_current_user
from app.models import LocalizedAsset, SourceAsset, User
from app.services.audit_bundle import build_regulatory_package
from app.services.cost_report import monthly_cost, path_mix

router = APIRouter()


@router.get("/cost")
async def cost(
    brand_id: uuid.UUID | None = Query(default=None),
    project_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=12, ge=1, le=60),
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> dict:
    # System admins get unscoped; ad_ops/brand_admin must scope.
    if not user.is_system_admin:
        if brand_id is None and project_id is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, detail="brand_id or project_id required"
            )
        if brand_id is not None:
            await _ensure_brand_access(session, user, brand_id)

    periods = await monthly_cost(
        session, brand_id=brand_id, project_id=project_id, limit=limit
    )
    mix = await path_mix(session)

    def serialize(x: Decimal) -> str:
        return str(x)

    return {
        "periods": [
            {
                **asdict(p),
                "total_usd": serialize(p.total_usd),
                "by_model": {k: serialize(v) for k, v in p.by_model.items()},
            }
            for p in periods
        ],
        "path_mix": asdict(mix),
        "cache_hit_rate": (
            mix.tm_cache_hit_count / mix.total_ai_calls
            if mix.total_ai_calls
            else 0.0
        ),
    }


@router.get("/audit/{localized_asset_id}")
async def audit_bundle(
    localized_asset_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    asset = await session.get(LocalizedAsset, localized_asset_id)
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="asset not found")
    source = await session.get(SourceAsset, asset.source_asset_id)
    if source is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="orphaned asset")
    await _ensure_brand_access(session, user, source.brand_id)

    try:
        zip_bytes = await build_regulatory_package(session, localized_asset_id)
    except LookupError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(e)) from e

    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="audit_{localized_asset_id}.zip"',
        },
    )
