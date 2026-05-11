from __future__ import annotations

import uuid
from dataclasses import asdict

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Brand, Project, PromptOverride, User
from app.prompt_assembly import PromptContext, UseCase, assemble
from app.schemas.prompt_override import (
    AssemblyPreviewIn,
    AssemblyPreviewOut,
    PromptOverrideOut,
    PromptOverrideUpsert,
)
from app.security.rbac import require_system_admin
from app.services.market_context import build_market_compliance_for, market_culture_for
from app.services.prompt_overrides import join_for_prompt, resolve_overrides

router = APIRouter()


@router.get("", response_model=list[PromptOverrideOut], dependencies=[Depends(require_system_admin)])
async def list_prompts(
    use_case: str | None = None,
    market: str | None = None,
    mode: str | None = None,
    session: AsyncSession = Depends(get_session),
) -> list[PromptOverride]:
    stmt = select(PromptOverride)
    if use_case:
        stmt = stmt.where(PromptOverride.use_case == use_case)
    if market is not None:
        stmt = stmt.where(PromptOverride.market == market)
    if mode is not None:
        stmt = stmt.where(PromptOverride.mode == mode)
    stmt = stmt.order_by(
        PromptOverride.use_case, PromptOverride.market, PromptOverride.mode
    )
    return list((await session.execute(stmt)).scalars().all())


@router.put(
    "",
    response_model=PromptOverrideOut,
    dependencies=[Depends(require_system_admin)],
)
async def upsert_prompt(
    payload: PromptOverrideUpsert,
    session: AsyncSession = Depends(get_session),
    user: User = Depends(require_system_admin),
) -> PromptOverride:
    if payload.use_case not in {uc.value for uc in UseCase}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="unknown use_case")
    existing = (
        await session.execute(
            select(PromptOverride).where(
                PromptOverride.use_case == payload.use_case,
                PromptOverride.market == payload.market,
                PromptOverride.mode == payload.mode,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        existing = PromptOverride(
            use_case=payload.use_case,
            market=payload.market,
            mode=payload.mode,
            content=payload.content,
            notes=payload.notes,
            is_active=payload.is_active,
            updated_by=user.id,
        )
        session.add(existing)
    else:
        existing.content = payload.content
        existing.notes = payload.notes
        existing.is_active = payload.is_active
        existing.updated_by = user.id
    await session.commit()
    await session.refresh(existing)
    return existing


@router.delete(
    "/{override_id}",
    status_code=204,
    dependencies=[Depends(require_system_admin)],
)
async def delete_prompt(
    override_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    row = await session.get(PromptOverride, override_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not found")
    await session.delete(row)
    await session.commit()


@router.post(
    "/preview",
    response_model=AssemblyPreviewOut,
    dependencies=[Depends(require_system_admin)],
)
async def preview_assembly(
    payload: AssemblyPreviewIn,
    session: AsyncSession = Depends(get_session),
) -> AssemblyPreviewOut:
    try:
        use_case = UseCase(payload.use_case)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    brand: Brand | None = None
    if payload.brand_id:
        brand = await session.get(Brand, payload.brand_id)
    project: Project | None = None
    if payload.campaign_id:
        project = await session.get(Project, payload.campaign_id)

    market_compliance: dict = {}
    if payload.market:
        try:
            market_compliance, _ = await build_market_compliance_for(
                session,
                brand_id=brand.id if brand else uuid.uuid4(),
                market=payload.market,
                sub_market=payload.sub_market,
            )
        except Exception:  # noqa: BLE001
            market_compliance = {}

    overrides = await resolve_overrides(
        session,
        use_case=use_case.value,
        market=payload.market,
        sub_market=payload.sub_market,
        active_modes=payload.modes,
    )

    ctx = PromptContext(
        use_case=use_case,
        market=payload.market or "*",
        sub_market=payload.sub_market,
        source_content={"text": "[sample source text]", "language": "en"},
        brand_id=brand.id if brand else None,
        brand_restrictions=brand.restrictions if brand else None,
        brand_voice=brand.voice if brand else None,
        market_compliance=market_compliance,
        market_culture=market_culture_for(payload.market) if payload.market else {},
        extra={
            "brand_prompt_additions": brand.prompt_additions if brand else "",
            "campaign_prompt_additions": project.prompt_additions if project else "",
            "prompt_overrides_text": join_for_prompt(overrides),
            "prompt_overrides_scopes": [o.scope for o in overrides],
        },
    )
    final, trace = assemble(ctx)

    return AssemblyPreviewOut(
        system_prompt=final.system_prompt,
        user_prompt=final.user_prompt,
        negative_prompt=final.negative_prompt,
        token_estimate=final.estimated_tokens(),
        layers=[
            {
                "name": l.layer_name,
                "priority": l.priority,
                "contribution": {
                    k: v for k, v in l.contribution.items() if v
                },
            }
            for l in trace.layers_applied
        ],
        overrides_applied=[asdict(o) for o in overrides],
    )
