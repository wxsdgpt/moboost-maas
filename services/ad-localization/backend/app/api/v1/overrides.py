from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.deps import get_current_user
from app.models import BrandMembership, BrandOverrideChangeLog, BrandRuleOverride, User
from app.models.enums import UserRole
from app.schemas.compliance import OverrideCreate, OverrideOut

router = APIRouter()


async def _require_brand_admin(
    brand_id: uuid.UUID, user: User, session: AsyncSession
) -> None:
    if user.is_system_admin:
        return
    result = await session.execute(
        select(BrandMembership).where(
            BrandMembership.user_id == user.id,
            BrandMembership.brand_id == brand_id,
            BrandMembership.role == UserRole.brand_admin,
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="brand admin required")


@router.get("/brand/{brand_id}", response_model=list[OverrideOut])
async def list_overrides(
    brand_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[BrandRuleOverride]:
    if not user.is_system_admin:
        result = await session.execute(
            select(BrandMembership).where(
                BrandMembership.user_id == user.id, BrandMembership.brand_id == brand_id
            )
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="no access")
    result = await session.execute(
        select(BrandRuleOverride)
        .where(BrandRuleOverride.brand_id == brand_id)
        .order_by(BrandRuleOverride.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("/brand/{brand_id}", response_model=OverrideOut, status_code=201)
async def create_override(
    brand_id: uuid.UUID,
    payload: OverrideCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> BrandRuleOverride:
    await _require_brand_admin(brand_id, user, session)

    ov = BrandRuleOverride(
        brand_id=brand_id,
        system_rule_id=payload.system_rule_id,
        override_type=payload.override_type,
        modifications=payload.modifications,
        new_rule_definition=payload.new_rule_definition,
        created_by=user.id,
        change_reason=payload.change_reason,
        effective_from=payload.effective_from,
        effective_to=payload.effective_to,
    )
    session.add(ov)
    await session.flush()

    session.add(
        BrandOverrideChangeLog(
            override_id=ov.id,
            changed_by=user.id,
            change_type="created",
            previous_state={},
            new_state={
                "override_type": ov.override_type.value,
                "system_rule_id": str(ov.system_rule_id) if ov.system_rule_id else None,
                "modifications": ov.modifications,
                "reason": ov.change_reason,
            },
        )
    )
    await session.commit()
    await session.refresh(ov)
    return ov


@router.patch("/{override_id}/deactivate", response_model=OverrideOut)
async def deactivate_override(
    override_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> BrandRuleOverride:
    ov = await session.get(BrandRuleOverride, override_id)
    if ov is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="override not found")
    await _require_brand_admin(ov.brand_id, user, session)
    previous = {
        "is_active": ov.is_active,
        "version": ov.version,
    }
    ov.is_active = False
    ov.version += 1
    session.add(
        BrandOverrideChangeLog(
            override_id=ov.id,
            changed_by=user.id,
            change_type="deactivated",
            previous_state=previous,
            new_state={"is_active": False, "version": ov.version},
        )
    )
    await session.commit()
    await session.refresh(ov)
    return ov
