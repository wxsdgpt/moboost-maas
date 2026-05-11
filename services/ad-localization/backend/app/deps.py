from __future__ import annotations

import secrets
import uuid

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.db import get_session
from app.models import User
from app.models.enums import UserRole
from app.security.jwt import InvalidTokenError, decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/v1/auth/login", auto_error=False)


async def _resolve_user_by_id(session: AsyncSession, user_id: uuid.UUID) -> User:
    """Fetch user by primary key with memberships eager-loaded."""
    result = await session.execute(
        select(User)
        .where(User.id == user_id)
        .options(selectinload(User.memberships))
    )
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="user not found / inactive")
    return user


async def _resolve_or_create_external_user(
    session: AsyncSession, external_id: str
) -> User:
    """Find user by external_id (Clerk user ID) or auto-create one."""
    result = await session.execute(
        select(User)
        .where(User.external_id == external_id)
        .options(selectinload(User.memberships))
    )
    user = result.scalar_one_or_none()
    if user is not None:
        if not user.is_active:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="user inactive")
        return user

    # Auto-create: external users arrive from moboost-maas proxy with no
    # pre-existing ad-localization account.  Create with ad_ops role (the
    # most common internal user type).
    new_user = User(
        email=f"{external_id}@external.moboost",
        name=external_id,
        external_id=external_id,
        primary_role=UserRole.ad_ops,
        is_system_admin=True,
        is_active=True,
    )
    session.add(new_user)
    await session.flush()
    # Re-fetch to get memberships relationship loaded
    result = await session.execute(
        select(User)
        .where(User.id == new_user.id)
        .options(selectinload(User.memberships))
    )
    return result.scalar_one()


async def get_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
    session: AsyncSession = Depends(get_session),
) -> User:
    """Dual-mode auth: service token (from moboost proxy) OR JWT (standalone).

    Service-token mode:
      Authorization: Bearer <ADLOC_SERVICE_TOKEN>
      X-User-Id: <clerk_user_id>

    JWT mode (original):
      Authorization: Bearer <jwt_access_token>
    """
    if token is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="missing bearer token")

    settings = get_settings()

    # --- Path 1: Service-to-service token from moboost-maas proxy ---
    if settings.service_token and secrets.compare_digest(token, settings.service_token):
        x_user_id = request.headers.get("x-user-id")
        if not x_user_id:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                detail="service token valid but X-User-Id header missing",
            )
        return await _resolve_or_create_external_user(session, x_user_id)

    # --- Path 2: Standard JWT auth (standalone / direct API use) ---
    try:
        payload = decode_token(token, expected_type="access")
    except InvalidTokenError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail=f"invalid token: {e}") from e

    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError) as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="malformed subject") from e

    return await _resolve_user_by_id(session, user_id)
