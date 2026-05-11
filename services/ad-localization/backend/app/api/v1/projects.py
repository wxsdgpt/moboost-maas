from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.deps import get_current_user
from app.models import Brand, BrandMembership, Project, User
from app.schemas.project import ProjectCreate, ProjectOut, ProjectUpdate

router = APIRouter()


async def _ensure_brand_access(
    session: AsyncSession, user: User, brand_id: uuid.UUID
) -> None:
    if user.is_system_admin:
        return
    result = await session.execute(
        select(BrandMembership).where(
            BrandMembership.user_id == user.id, BrandMembership.brand_id == brand_id
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="no access to brand")


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    brand_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
    limit: int = 100,
    offset: int = 0,
) -> list[Project]:
    await _ensure_brand_access(session, user, brand_id)
    result = await session.execute(
        select(Project)
        .where(Project.brand_id == brand_id, Project.is_active.is_(True))
        .order_by(Project.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(
    payload: ProjectCreate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Project:
    brand = await session.get(Brand, payload.brand_id)
    if brand is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="brand not found")
    await _ensure_brand_access(session, user, payload.brand_id)
    project = Project(
        brand_id=payload.brand_id,
        name=payload.name,
        description=payload.description,
        tags=payload.tags,
        created_by=user.id,
    )
    session.add(project)
    await session.commit()
    await session.refresh(project)
    return project


@router.patch("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Project:
    project = await session.get(Project, project_id)
    if project is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="project not found")
    await _ensure_brand_access(session, user, project.brand_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, field, value)
    await session.commit()
    await session.refresh(project)
    return project
