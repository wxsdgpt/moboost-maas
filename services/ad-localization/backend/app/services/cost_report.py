from __future__ import annotations

import uuid
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import Numeric, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AIGenerationLog, CostRecord, LocalizationJob


@dataclass
class PeriodCost:
    billing_period: str
    total_usd: Decimal
    ai_calls: int
    cache_hits: int
    by_model: dict[str, Decimal]


async def monthly_cost(
    session: AsyncSession,
    *,
    brand_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    limit: int = 12,
) -> list[PeriodCost]:
    q = select(
        CostRecord.billing_period,
        func.coalesce(func.sum(CostRecord.cost_usd), 0).label("total_usd"),
        func.count(CostRecord.id).label("calls"),
        func.coalesce(
            func.sum(func.cast(CostRecord.cache_hit, Numeric(1, 0))), 0
        ).label("cache_hits"),
    ).group_by(CostRecord.billing_period).order_by(CostRecord.billing_period.desc())

    if project_id is not None:
        q = q.where(CostRecord.project_id == project_id)
    if brand_id is not None:
        q = q.where(
            CostRecord.localization_job_id.in_(
                select(LocalizationJob.id).where(
                    LocalizationJob.source_asset_id.in_(
                        select(LocalizationJob.source_asset_id)
                    )
                )
            )
        )
    q = q.limit(limit)
    rows = (await session.execute(q)).all()

    out: list[PeriodCost] = []
    for r in rows:
        by_model = await _cost_by_model(session, r.billing_period, project_id, brand_id)
        out.append(
            PeriodCost(
                billing_period=r.billing_period,
                total_usd=Decimal(r.total_usd),
                ai_calls=int(r.calls),
                cache_hits=int(r.cache_hits or 0),
                by_model=by_model,
            )
        )
    return out


async def _cost_by_model(
    session: AsyncSession,
    period: str,
    project_id: uuid.UUID | None,
    brand_id: uuid.UUID | None,
) -> dict[str, Decimal]:
    q = (
        select(
            CostRecord.model,
            func.coalesce(func.sum(CostRecord.cost_usd), 0).label("total"),
        )
        .where(CostRecord.billing_period == period)
        .group_by(CostRecord.model)
    )
    if project_id is not None:
        q = q.where(CostRecord.project_id == project_id)
    rows = (await session.execute(q)).all()
    return {r.model: Decimal(r.total) for r in rows}


@dataclass
class PathMix:
    psd_path_count: int
    ai_path_count: int
    tm_cache_hit_count: int
    total_ai_calls: int


async def path_mix(session: AsyncSession) -> PathMix:
    psd = (
        await session.execute(
            select(func.count(AIGenerationLog.id)).where(
                AIGenerationLog.use_case == "psd_text_swap"
            )
        )
    ).scalar_one()
    ai = (
        await session.execute(
            select(func.count(AIGenerationLog.id)).where(
                AIGenerationLog.cache_hit.is_(False),
                AIGenerationLog.use_case != "psd_text_swap",
            )
        )
    ).scalar_one()
    cache = (
        await session.execute(
            select(func.count(AIGenerationLog.id)).where(
                AIGenerationLog.cache_hit.is_(True)
            )
        )
    ).scalar_one()
    total = (
        await session.execute(select(func.count(AIGenerationLog.id)))
    ).scalar_one()
    return PathMix(
        psd_path_count=int(psd or 0),
        ai_path_count=int(ai or 0),
        tm_cache_hit_count=int(cache or 0),
        total_ai_calls=int(total or 0),
    )
