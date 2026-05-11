from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.projects import _ensure_brand_access
from app.db import get_session
from app.deps import get_current_user
from app.models import (
    ComplianceRule,
    LocalizedAsset,
    SourceAsset,
    User,
)
from app.schemas.compliance import (
    CheckResult,
    ConfirmRequest,
    ConfirmationOut,
    FindingOut,
    RuleOut,
)
from app.services.compliance_check import run_check
from app.services.confirmation import confirm_asset

router = APIRouter()


@router.get("/rules", response_model=list[RuleOut])
async def list_rules(
    market: str | None = None,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_user),
) -> list[ComplianceRule]:
    stmt = select(ComplianceRule).where(ComplianceRule.is_active.is_(True))
    if market:
        stmt = stmt.where(ComplianceRule.market.in_([market, "*"]))
    stmt = stmt.order_by(ComplianceRule.market, ComplianceRule.code)
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.post("/check/{localized_asset_id}", response_model=CheckResult)
async def run_compliance_check(
    localized_asset_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> CheckResult:
    asset = await session.get(LocalizedAsset, localized_asset_id)
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="localized asset not found")
    source = await session.get(SourceAsset, asset.source_asset_id)
    if source is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="orphaned asset")
    await _ensure_brand_access(session, user, source.brand_id)

    try:
        report, findings, effective = await run_check(session, localized_asset_id)
    except LookupError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    await session.commit()

    return CheckResult(
        market=asset.target_market.value,
        sub_market=asset.target_sub_market,
        overall_status=report.overall_status,
        findings=[FindingOut.model_validate(f) for f in report.findings],
        effective_rule_count=len(effective),
        disabled_rule_count=0,  # populated once override merge returns counts
    )


@router.post("/confirm/{localized_asset_id}", response_model=ConfirmationOut)
async def confirm(
    localized_asset_id: uuid.UUID,
    payload: ConfirmRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> ConfirmationOut:
    asset = await session.get(LocalizedAsset, localized_asset_id)
    if asset is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="localized asset not found")
    source = await session.get(SourceAsset, asset.source_asset_id)
    if source is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="orphaned asset")
    await _ensure_brand_access(session, user, source.brand_id)

    acks = [a.model_dump() for a in payload.acknowledgments]
    try:
        confirmation = await confirm_asset(
            session,
            localized_asset_id=localized_asset_id,
            confirmed_by=user.id,
            acknowledgments=acks,
            comments=payload.comments,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    except LookupError as e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail=str(e)) from e
    await session.commit()
    return ConfirmationOut.model_validate(confirmation)
