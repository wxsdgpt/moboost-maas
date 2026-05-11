from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.deps import get_current_user
from app.models import SubMarket, User
from app.models.enums import Market
from app.schemas.sub_market import SubMarketOut, SubMarketUpdate
from app.security.rbac import require_system_admin

router = APIRouter()


@router.get("", response_model=list[SubMarketOut])
async def list_sub_markets(
    market: Market | None = None,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_user),
) -> list[SubMarket]:
    stmt = select(SubMarket).order_by(SubMarket.id)
    if market is not None:
        stmt = stmt.where(SubMarket.parent_market == market)
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.get("/{sub_market_id}", response_model=SubMarketOut)
async def get_sub_market(
    sub_market_id: str,
    session: AsyncSession = Depends(get_session),
    _user: User = Depends(get_current_user),
) -> SubMarket:
    sm = await session.get(SubMarket, sub_market_id)
    if sm is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="sub-market not found")
    return sm


@router.patch(
    "/{sub_market_id}",
    response_model=SubMarketOut,
    dependencies=[Depends(require_system_admin)],
)
async def update_sub_market(
    sub_market_id: str,
    payload: SubMarketUpdate,
    session: AsyncSession = Depends(get_session),
) -> SubMarket:
    sm = await session.get(SubMarket, sub_market_id)
    if sm is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="sub-market not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(sm, field, value)
    await session.commit()
    await session.refresh(sm)
    return sm
