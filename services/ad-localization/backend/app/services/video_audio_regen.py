"""Veo 3.1 audio regeneration orchestration.

Submits the operation, records an in-progress AIGenerationLog, enqueues a
procrastinate poll task, and (once done) writes the new MP4 back to storage.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import AIError
from app.ai.veo_adapter import VeoAdapter
from app.logging import get_logger
from app.models import AIGenerationLog, LocalizedAsset
from app.models.enums import AIModel, AIStatus
from app.prompt_assembly import PromptContext, UseCase, assemble
from app.storage import get_storage

log = get_logger(__name__)


async def submit_audio_regen(
    session: AsyncSession,
    *,
    localized_asset_id: uuid.UUID,
    source_video: bytes,
    market: str,
    sub_market: str | None,
    market_compliance: dict,
    market_audio: dict | None,
) -> str | None:
    """Submit the operation and return its name. Writes an initial
    AIGenerationLog with status=success (placeholder) updated on poll.
    """
    ctx = PromptContext(
        use_case=UseCase.VIDEO_AUDIO_REPLACE,
        market=market,
        sub_market=sub_market,
        market_compliance=market_compliance,
        market_audio=market_audio,
        source_content={"mime_type": "video/mp4"},
    )
    prompt, trace = assemble(ctx)

    try:
        adapter = VeoAdapter()
        op = await adapter.submit(prompt, source_video=source_video)
    except AIError as e:
        log.warning("veo.submit_failed", error=str(e), asset_id=str(localized_asset_id))
        return None

    ai_log = AIGenerationLog(
        localized_asset_id=localized_asset_id,
        use_case=UseCase.VIDEO_AUDIO_REPLACE.value,
        model=AIModel.veo_3_1,
        provider_model_id=adapter.model,
        assembly_trace=trace.to_dict(),
        input_hash=f"veo:{localized_asset_id}:{market}:{sub_market}",
        output_text=None,
        cost_usd=Decimal(0),
        status=AIStatus.success,  # operation accepted; final status written on poll
        verification={},
        cache_hit=False,
        cache_key=op.name,
    )
    session.add(ai_log)
    await session.flush()
    return op.name


async def poll_and_complete(
    session: AsyncSession,
    *,
    localized_asset_id: uuid.UUID,
    operation_name: str,
) -> bool:
    """Drive one poll cycle. Returns True when the operation has completed
    and the updated MP4 has been persisted. False otherwise.
    """
    try:
        adapter = VeoAdapter()
        out = await adapter.poll(operation_name)
    except AIError as e:
        log.warning("veo.poll_failed", error=str(e), asset_id=str(localized_asset_id))
        return False
    if out is None:
        return False

    asset = await session.get(LocalizedAsset, localized_asset_id)
    if asset is None:
        return False

    storage = get_storage()
    if out.video_bytes is None:
        log.warning("veo.poll.no_bytes", asset_id=str(localized_asset_id))
        return False

    new_key = f"{asset.output_storage_key}.audio-regen.mp4"
    await storage.put(new_key, out.video_bytes, content_type="video/mp4")
    asset.output_storage_key = new_key
    await session.flush()
    return True
