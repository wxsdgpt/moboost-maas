from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import User
from app.schemas.settings import SettingOut, SettingUpdate
from app.security.rbac import require_system_admin
from app.services import settings_store

router = APIRouter()


@router.get("", response_model=list[SettingOut], dependencies=[Depends(require_system_admin)])
async def list_settings(session: AsyncSession = Depends(get_session)) -> list[SettingOut]:
    views = await settings_store.list_settings(session)
    return [SettingOut.model_validate(asdict(v)) for v in views]


@router.put(
    "/{key}",
    response_model=SettingOut,
    dependencies=[Depends(require_system_admin)],
)
async def put_setting(
    key: str,
    payload: SettingUpdate,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_system_admin),
) -> SettingOut:
    try:
        await settings_store.set_value(
            session, key=key, value=payload.value, updated_by=user.id
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    await session.commit()
    views = await settings_store.list_settings(session)
    row = next((v for v in views if v.key == key), None)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="setting not found")
    return SettingOut.model_validate(asdict(row))
