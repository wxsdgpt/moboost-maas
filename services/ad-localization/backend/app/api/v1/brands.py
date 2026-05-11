from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.deps import get_current_user
from app.models import Brand, BrandMembership, User
from app.models.enums import UserRole
from app.schemas.brand import BrandCreate, BrandOut, BrandUpdate
from app.security.rbac import require_brand_access, require_system_admin

router = APIRouter()


@router.get("", response_model=list[BrandOut])
async def list_brands(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[Brand]:
    if user.is_system_admin:
        result = await session.execute(select(Brand).where(Brand.is_active.is_(True)))
    else:
        result = await session.execute(
            select(Brand)
            .join(BrandMembership, BrandMembership.brand_id == Brand.id)
            .where(
                BrandMembership.user_id == user.id,
                Brand.is_active.is_(True),
            )
        )
    return list(result.scalars().unique().all())


@router.post(
    "",
    response_model=BrandOut,
    status_code=201,
    dependencies=[Depends(require_system_admin)],
)
async def create_brand(
    payload: BrandCreate, session: AsyncSession = Depends(get_session)
) -> Brand:
    brand = Brand(
        name=payload.name,
        slug=payload.slug,
        display_name_by_market=payload.display_name_by_market,
        restrictions=payload.restrictions.model_dump(),
        voice=payload.voice.model_dump(),
        lock_brand_name=payload.lock_brand_name,
    )
    session.add(brand)
    try:
        await session.commit()
    except IntegrityError as e:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail="brand name/slug exists") from e
    await session.refresh(brand)
    return brand


@router.get("/{brand_id}", response_model=BrandOut)
async def get_brand(
    brand_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    _mem=Depends(require_brand_access),
) -> Brand:
    brand = await session.get(Brand, brand_id)
    if brand is None or not brand.is_active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="brand not found")
    return brand


@router.patch("/{brand_id}", response_model=BrandOut)
async def update_brand(
    brand_id: uuid.UUID,
    payload: BrandUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Brand:
    brand = await session.get(Brand, brand_id)
    if brand is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="brand not found")
    # enforce brand admin for the target brand (or system admin)
    if not user.is_system_admin:
        result = await session.execute(
            select(BrandMembership).where(
                BrandMembership.user_id == user.id,
                BrandMembership.brand_id == brand_id,
                BrandMembership.role == UserRole.brand_admin,
            )
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="brand admin required")
    data = payload.model_dump(exclude_unset=True)
    if "restrictions" in data and data["restrictions"] is not None:
        brand.restrictions = data.pop("restrictions")
    if "voice" in data and data["voice"] is not None:
        brand.voice = data.pop("voice")
    for field, value in data.items():
        setattr(brand, field, value)
    brand.version += 1
    await session.commit()
    await session.refresh(brand)
    return brand
