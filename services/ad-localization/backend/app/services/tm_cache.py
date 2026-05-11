"""Translation Memory cache.

Cache key per PROMPT_ASSEMBLY.md:
    hash(source_text + use_case + target_market + brand_id + glossary_version)

Hits bypass the LLM entirely. Entries are invalidated on brand/glossary version
change (the brand_version + glossary_version are part of the key, so old entries
just stop matching naturally).
"""

from __future__ import annotations

import hashlib
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TranslationMemoryEntry


def make_cache_key(
    *,
    source_text: str,
    use_case: str,
    target_market: str,
    brand_id: uuid.UUID | None,
    brand_version: int | None,
    glossary_version: int | None,
) -> str:
    payload = "|".join(
        [
            source_text.strip(),
            use_case,
            target_market,
            str(brand_id) if brand_id else "-",
            str(brand_version or 0),
            str(glossary_version or 0),
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


async def lookup(session: AsyncSession, cache_key: str) -> TranslationMemoryEntry | None:
    result = await session.execute(
        select(TranslationMemoryEntry).where(TranslationMemoryEntry.cache_key == cache_key)
    )
    hit = result.scalar_one_or_none()
    if hit and hit.invalidated_at is None:
        hit.usage_count += 1
        return hit
    return None


async def store(
    session: AsyncSession,
    *,
    cache_key: str,
    source_text: str,
    source_language: str,
    target_text: str,
    target_market: str,
    use_case: str,
    brand_id: uuid.UUID | None,
    brand_version: int | None,
    glossary_version: int | None,
    original_generation_id: uuid.UUID | None,
) -> TranslationMemoryEntry:
    entry = TranslationMemoryEntry(
        cache_key=cache_key,
        source_text=source_text,
        source_language=source_language,
        target_text=target_text,
        target_market=target_market,
        use_case=use_case,
        brand_id=brand_id,
        brand_version=brand_version,
        glossary_version=glossary_version,
        original_generation_id=original_generation_id,
        usage_count=0,
    )
    session.add(entry)
    await session.flush()
    return entry
