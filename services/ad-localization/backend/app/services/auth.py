from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.schemas.auth import TokenPair
from app.security.jwt import create_token
from app.security.password import verify_password


async def authenticate(session: AsyncSession, email: str, password: str) -> User | None:
    result = await session.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        return None
    if not verify_password(password, user.password_hash):
        return None
    user.last_login_at = datetime.now(timezone.utc)
    await session.flush()
    return user


def issue_tokens(user: User) -> TokenPair:
    claims = {
        "role": user.primary_role.value,
        "is_sys_admin": user.is_system_admin,
    }
    return TokenPair(
        access_token=create_token(user.id, "access", claims),
        refresh_token=create_token(user.id, "refresh"),
    )
