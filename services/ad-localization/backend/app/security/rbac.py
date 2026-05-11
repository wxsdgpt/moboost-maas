"""Role-based access helpers. Use as FastAPI Depends(...) factories."""

from __future__ import annotations

import uuid

from fastapi import Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.deps import get_current_user
from app.models import BrandMembership, User
from app.models.enums import UserRole


def require_system_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_system_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="system admin required")
    return user


def require_role(*allowed: UserRole):
    async def _dep(user: User = Depends(get_current_user)) -> User:
        if user.is_system_admin:
            return user
        if user.primary_role in allowed:
            return user
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="role not permitted")

    return _dep


async def require_brand_access(
    brand_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
    roles: tuple[UserRole, ...] = (UserRole.ad_ops, UserRole.brand_admin),
) -> BrandMembership | None:
    """
    Verify the user has a membership in brand_id with one of `roles`.
    System admins bypass the check (read-only semantics enforced at the endpoint level).
    """
    if user.is_system_admin:
        return None
    result = await session.execute(
        select(BrandMembership).where(
            BrandMembership.user_id == user.id,
            BrandMembership.brand_id == brand_id,
        )
    )
    membership = result.scalar_one_or_none()
    if membership is None or membership.role not in roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="no access to brand")
    return membership


def require_brand_admin(brand_id: uuid.UUID):
    async def _dep(
        user: User = Depends(get_current_user),
        session: AsyncSession = Depends(get_session),
    ) -> User:
        if user.is_system_admin:
            return user
        result = await session.execute(
            select(BrandMembership).where(
                BrandMembership.user_id == user.id,
                BrandMembership.brand_id == brand_id,
                BrandMembership.role == UserRole.brand_admin,
            )
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="brand admin required")
        return user

    return _dep
