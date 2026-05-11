"""System-setting read/write with env fallback.

Resolution order (when a feature asks for a setting):
  1. Row in ``system_settings``
  2. Value from ``app.config.Settings`` (env-loaded)

Secrets are masked in GET responses.
"""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import SystemSetting


# keys the UI can manage; value is the pydantic-settings attr name on app.config.Settings
KEY_ENV_MAP: dict[str, str] = {
    # OpenRouter (OpenAI-compatible gateway) covers everything.
    # base_url is fixed — the adapters use the openai SDK pointed at OpenRouter.
    "openrouter_api_key": "openrouter_api_key",
    "openrouter_model": "openrouter_model",
    "openrouter_vision_model": "openrouter_vision_model",
    "openrouter_image_edit_model": "openrouter_image_edit_model",
    "openrouter_video_model": "openrouter_video_model",
    "openrouter_text_review_model": "openrouter_text_review_model",
    "openrouter_image_review_model": "openrouter_image_review_model",
}

# keys whose values are masked in responses
SECRET_KEYS = {
    "openrouter_api_key",
}


@dataclass
class SettingView:
    key: str
    category: str
    description: str | None
    value_masked: str
    has_value: bool
    source: str  # "db" | "env" | "none"


def mask(value: str | None, *, secret: bool = True) -> str:
    if not value:
        return ""
    if not secret:
        return value
    if len(value) <= 6:
        return "•" * len(value)
    return "•" * (len(value) - 4) + value[-4:]


def describe(key: str) -> str:
    return {
        "openrouter_api_key": "Single key for all AI calls (text, vision, image edit, video).",
        "openrouter_base_url": "Gateway URL. Leave as default unless you proxy OpenRouter.",
        "openrouter_model": "Model id for text localization (translate / light / transcreate).",
        "openrouter_vision_model": "Model id for parsing source assets into Localizable Units.",
        "openrouter_image_edit_model": "Model id for visual LU edits (Nano Banana-class mask editing).",
        "openrouter_video_model": "Model id for replacing audio on a source video while preserving frames.",
        "openrouter_text_review_model": "Reviewer for text translations (meaning / brand voice / compliance). Leave empty to skip.",
        "openrouter_image_review_model": "Reviewer for image edits (mask respect / composition / compliance). Leave empty to skip.",
    }.get(key, "")


async def list_settings(session: AsyncSession) -> list[SettingView]:
    rows = (
        (await session.execute(select(SystemSetting))).scalars().all()
    )
    db_by_key: dict[str, SystemSetting] = {r.key: r for r in rows}
    env = get_settings()
    out: list[SettingView] = []
    for key in KEY_ENV_MAP:
        secret = key in SECRET_KEYS
        db_row = db_by_key.get(key)
        env_val = getattr(env, KEY_ENV_MAP[key], None)
        if db_row and db_row.value:
            out.append(
                SettingView(
                    key=key,
                    category="secret" if secret else "config",
                    description=describe(key),
                    value_masked=mask(db_row.value, secret=secret),
                    has_value=True,
                    source="db",
                )
            )
        elif env_val:
            out.append(
                SettingView(
                    key=key,
                    category="secret" if secret else "config",
                    description=describe(key),
                    value_masked=mask(str(env_val), secret=secret),
                    has_value=True,
                    source="env",
                )
            )
        else:
            out.append(
                SettingView(
                    key=key,
                    category="secret" if secret else "config",
                    description=describe(key),
                    value_masked="",
                    has_value=False,
                    source="none",
                )
            )
    return out


async def set_value(
    session: AsyncSession,
    *,
    key: str,
    value: str,
    updated_by: uuid.UUID,
) -> SystemSetting:
    if key not in KEY_ENV_MAP:
        raise ValueError(f"unknown setting key: {key}")
    row = (
        await session.execute(select(SystemSetting).where(SystemSetting.key == key))
    ).scalar_one_or_none()
    if row is None:
        row = SystemSetting(
            key=key,
            category="secret" if key in SECRET_KEYS else "config",
            value=value,
            description=describe(key),
            updated_by=updated_by,
        )
        session.add(row)
    else:
        row.value = value
        row.updated_by = updated_by
    await session.flush()

    # Push into the process env + invalidate the cached Settings so the next
    # AI adapter call (which reads get_settings()) picks up the new value
    # without requiring a restart.
    os.environ[key.upper()] = value
    get_settings.cache_clear()
    return row


async def resolve(session: AsyncSession, key: str) -> str | None:
    """Resolve a setting's effective value (DB wins, else env)."""
    row = (
        await session.execute(select(SystemSetting).where(SystemSetting.key == key))
    ).scalar_one_or_none()
    if row and row.value:
        return row.value
    env = get_settings()
    attr = KEY_ENV_MAP.get(key, key)
    val = getattr(env, attr, None)
    return str(val) if val else None
