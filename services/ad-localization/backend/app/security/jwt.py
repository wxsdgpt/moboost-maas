from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from uuid import UUID

from jose import JWTError, jwt

from app.config import get_settings

TokenType = Literal["access", "refresh"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def create_token(
    subject: str | UUID,
    token_type: TokenType = "access",
    extra_claims: dict[str, Any] | None = None,
) -> str:
    settings = get_settings()
    ttl = (
        timedelta(minutes=settings.jwt_access_ttl_minutes)
        if token_type == "access"
        else timedelta(days=settings.jwt_refresh_ttl_days)
    )
    now = _now()
    payload: dict[str, Any] = {
        "sub": str(subject),
        "iat": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
        "typ": token_type,
        **(extra_claims or {}),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str, expected_type: TokenType | None = None) -> dict[str, Any]:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError as e:
        raise InvalidTokenError(str(e)) from e
    if expected_type and payload.get("typ") != expected_type:
        raise InvalidTokenError(f"expected typ={expected_type}, got {payload.get('typ')}")
    return payload


class InvalidTokenError(Exception):
    pass
