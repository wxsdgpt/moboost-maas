"""End-to-end text localization glue:
  LU + strategy + market → Prompt Assembly → TM cache → LLM → persisted result.

Writes an AIGenerationLog for every (non-cached) call with the full trace.
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import AIError, get_text_adapter
from app.logging import get_logger
from app.models import AIGenerationLog, Brand, LocalizableUnit
from app.models.enums import AIModel, AIStatus
from app.prompt_assembly import (
    PromptContext,
    UseCase,
    assemble,
)
from app.services import tm_cache

log = get_logger(__name__)


_STRATEGY_TO_USE_CASE: dict[str, UseCase] = {
    "literal_translate": UseCase.TEXT_LITERAL_TRANSLATE,
    "light_localize": UseCase.TEXT_LIGHT_LOCALIZE,
    "transcreate": UseCase.TEXT_TRANSCREATE,
}


async def localize_text_lu(
    session: AsyncSession,
    *,
    lu: LocalizableUnit,
    strategy: str,
    market: str,
    sub_market: str | None,
    brand: Brand | None,
    market_compliance: dict | None = None,
    market_culture: dict | None = None,
    few_shot_examples: list[dict] | None = None,
    campaign_prompt_additions: str = "",
    user_instructions: str | None = None,
    user_provided_content: str | None = None,
) -> dict:
    """Returns { target_text, cache_hit, ai_log_id? }."""

    source_text = (lu.source_content or {}).get("text", "")

    if strategy == "keep_original":
        return {"target_text": source_text, "cache_hit": True, "source_text": source_text}

    if strategy == "user_provided":
        if not user_provided_content:
            raise ValueError("user_provided strategy requires user_provided_content")
        return {
            "target_text": user_provided_content,
            "cache_hit": True,
            "source_text": source_text,
        }

    use_case = _STRATEGY_TO_USE_CASE.get(strategy)
    if use_case is None:
        raise ValueError(f"unsupported text strategy: {strategy}")

    target_tag = sub_market or market

    # TM cache lookup
    key = tm_cache.make_cache_key(
        source_text=source_text,
        use_case=use_case.value,
        target_market=target_tag,
        brand_id=brand.id if brand else None,
        brand_version=brand.version if brand else None,
        glossary_version=None,
    )
    hit = await tm_cache.lookup(session, key)
    if hit is not None:
        log.info("tm.hit", cache_key=key[:12], lu_id=str(lu.id))
        return {"target_text": hit.target_text, "cache_hit": True, "source_text": source_text}

    # Resolve admin-editable prompt overrides for this call.
    from app.services.prompt_overrides import join_for_prompt, resolve_overrides

    overrides = await resolve_overrides(
        session,
        use_case=use_case.value,
        market=market,
        sub_market=sub_market,
        active_modes=["language"],
    )

    ctx = PromptContext(
        use_case=use_case,
        market=market,
        sub_market=sub_market,
        source_lu_id=lu.id,
        source_content=lu.source_content,
        source_location=lu.source_location,
        brand_id=brand.id if brand else None,
        brand_version=brand.version if brand else None,
        brand_restrictions=brand.restrictions if brand else None,
        brand_voice=brand.voice if brand else None,
        market_compliance=market_compliance,
        market_culture=market_culture,
        strategy=strategy,
        user_instructions=user_instructions,
        user_provided_content=user_provided_content,
        few_shot_examples=few_shot_examples or [],
        extra={
            "brand_prompt_additions": getattr(brand, "prompt_additions", "") or "",
            "campaign_prompt_additions": campaign_prompt_additions or "",
            "prompt_overrides_text": join_for_prompt(overrides),
            "prompt_overrides_scopes": [o.scope for o in overrides],
        },
    )
    prompt, trace = assemble(ctx)

    adapter = get_text_adapter(use_case)

    try:
        output = await adapter.generate(prompt)
    except AIError:
        raise

    target_text = _unwrap_json(output.text) if prompt.forced_params.get(
        "response_format", {}
    ).get("type") == "json_object" else output.text.strip()

    ai_log = AIGenerationLog(
        lu_id=lu.id,
        use_case=use_case.value,
        # OpenRouter model ids carry the provider prefix (e.g. anthropic/claude-...);
        # infer the family string for reporting.
        model=_infer_family(output.provider_model_id),
        provider_model_id=output.provider_model_id,
        assembly_trace=trace.to_dict(),
        input_hash=key,
        output_text=target_text,
        cost_usd=output.cost_usd or Decimal(0),
        tokens_input=output.tokens_input,
        tokens_output=output.tokens_output,
        status=AIStatus.success,
        cache_hit=False,
        cache_key=key,
    )
    session.add(ai_log)
    await session.flush()

    await tm_cache.store(
        session,
        cache_key=key,
        source_text=source_text,
        source_language=(lu.source_content or {}).get("language", "en"),
        target_text=target_text,
        target_market=target_tag,
        use_case=use_case.value,
        brand_id=brand.id if brand else None,
        brand_version=brand.version if brand else None,
        glossary_version=None,
        original_generation_id=ai_log.id,
    )

    # Second-opinion review. No-op when openrouter_review_model is unset.
    from app.services.review import review_translation

    review = await review_translation(
        session,
        lu_id=lu.id,
        source_text=source_text,
        target_text=target_text,
        source_language=(lu.source_content or {}).get("language", "en"),
        target_market=market,
        sub_market=sub_market,
        strategy=strategy,
        brand_restrictions=brand.restrictions if brand else None,
        brand_voice=brand.voice if brand else None,
        market_compliance=market_compliance,
    )
    return {
        "target_text": target_text,
        "cache_hit": False,
        "source_text": source_text,
        "ai_log_id": str(ai_log.id),
        "review": review.to_dict(),
    }


def _unwrap_json(text: str) -> str:
    """LLMs in JSON mode often wrap the single answer in {"text": "..."} or similar.

    Try a few common shapes; fall back to raw text.
    """
    import json

    try:
        obj = json.loads(text)
    except json.JSONDecodeError:
        return text.strip()
    for key in ("text", "translation", "target", "output", "result"):
        if isinstance(obj.get(key), str):
            return obj[key].strip()
    # single-candidate list
    if isinstance(obj, list) and obj and isinstance(obj[0], str):
        return obj[0].strip()
    return text.strip()


def _uuid(x) -> uuid.UUID | None:
    if x is None:
        return None
    return x if isinstance(x, uuid.UUID) else uuid.UUID(str(x))


def _infer_family(provider_model_id: str) -> AIModel:
    m = (provider_model_id or "").lower()
    if "claude" in m:
        return AIModel.claude
    if "gemini" in m or "gemma" in m:
        return AIModel.gemini
    if "gpt" in m or "openai" in m:
        return AIModel.gpt_4
    if "nano" in m or "banana" in m:
        return AIModel.nano_banana
    if "veo" in m:
        return AIModel.veo_3_1
    return AIModel.gpt_4
