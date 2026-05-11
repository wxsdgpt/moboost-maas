"""Resolve admin-editable prompt overrides for a given AI call.

Specificity order (most → least specific):
  1. (use_case, sub_market, mode)
  2. (use_case, parent_market, mode)
  3. (use_case, "", mode)
  4. (use_case, sub_market, "")
  5. (use_case, parent_market, "")
  6. (use_case, "", "")

All matches are concatenated in that order so the most-specific override is
read last by the LLM (recency-biased).
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PromptOverride


@dataclass
class ResolvedOverride:
    scope: str  # human-readable label for trace
    content: str


async def resolve_overrides(
    session: AsyncSession,
    *,
    use_case: str,
    market: str,
    sub_market: str | None,
    active_modes: list[str],
) -> list[ResolvedOverride]:
    rows = (
        (
            await session.execute(
                select(PromptOverride).where(
                    PromptOverride.use_case == use_case,
                    PromptOverride.is_active.is_(True),
                )
            )
        )
        .scalars()
        .all()
    )
    if not rows:
        return []

    def matches(r: PromptOverride) -> tuple[int, str] | None:
        m_matches = (
            r.market == ""
            or r.market == market
            or (sub_market is not None and r.market == sub_market)
        )
        mode_matches = r.mode == "" or r.mode in active_modes
        if not m_matches or not mode_matches:
            return None
        # Specificity: sub_market > parent > "" + mode > ""
        market_score = (
            2 if sub_market is not None and r.market == sub_market
            else 1 if r.market == market
            else 0
        )
        mode_score = 1 if r.mode else 0
        label_parts = [r.market or "*", r.mode or "*"]
        return (market_score * 2 + mode_score, f"market={label_parts[0]} mode={label_parts[1]}")

    scored: list[tuple[int, str, str]] = []
    for r in rows:
        m = matches(r)
        if m is None:
            continue
        score, label = m
        scored.append((score, label, r.content.strip()))

    scored.sort(key=lambda x: x[0])
    return [
        ResolvedOverride(scope=label, content=content)
        for _, label, content in scored
        if content
    ]


def join_for_prompt(overrides: list[ResolvedOverride]) -> str:
    if not overrides:
        return ""
    chunks: list[str] = []
    for o in overrides:
        chunks.append(f"[Admin override — {o.scope}]\n{o.content}")
    return "\n\n".join(chunks)
