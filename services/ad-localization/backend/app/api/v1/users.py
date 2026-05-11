from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_session
from app.models import User
from app.schemas.user import UserCreate, UserOut, UserUpdate
from app.security.password import hash_password
from app.security.rbac import require_system_admin

router = APIRouter()


@router.get("", response_model=list[UserOut], dependencies=[Depends(require_system_admin)])
async def list_users(
    session: AsyncSession = Depends(get_session),
    limit: int = 100,
    offset: int = 0,
) -> list[User]:
    result = await session.execute(
        select(User)
        .options(selectinload(User.memberships))
        .order_by(User.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


@router.post("", response_model=UserOut, status_code=201, dependencies=[Depends(require_system_admin)])
async def create_user(
    payload: UserCreate, session: AsyncSession = Depends(get_session)
) -> User:
    existing = await session.execute(select(User).where(User.email == payload.email))
    if existing.scalar_one_or_none() is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="email already registered")
    user = User(
        email=payload.email,
        name=payload.name,
        password_hash=hash_password(payload.password),
        primary_role=payload.primary_role,
        is_system_admin=payload.is_system_admin,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user, attribute_names=["memberships"])
    return user


@router.patch("/{user_id}", response_model=UserOut, dependencies=[Depends(require_system_admin)])
async def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    session: AsyncSession = Depends(get_session),
) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="user not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await session.commit()
    await session.refresh(user, attribute_names=["memberships"])
    return user
