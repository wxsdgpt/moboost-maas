"""Build the market_compliance + market_culture dicts consumed by the
Prompt Assembly MarketComplianceLayer / MarketCultureLayer.

The compliance dict is derived from the effective rule set (system defaults
merged with brand overrides), not seeded manually. The culture dict is a
small static map, keyed by parent market, that carries primary sport and
idiomatic-guidance hints.
"""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.compliance import EffectiveRule, compile_effective_rules
from app.models import BrandRuleOverride, ComplianceRule, SubMarket
from app.models.enums import RuleCategory

_CULTURE: dict[str, dict] = {
    "US": {
        "primary_sport": "NFL / NBA / MLB; college references prohibited",
        "idiomatic_guidance": "American English registers; avoid Britishisms.",
        "avoid_references": ["college sports", "NCAA"],
    },
    "UK": {
        "primary_sport": "Premier League football; horse racing secondary",
        "idiomatic_guidance": "British English; measured tone per UKGC.",
        "avoid_references": ["over-excited hype", "financial-solution framing"],
    },
    "BR": {
        "primary_sport": "futebol (association football)",
        "idiomatic_guidance": "Brazilian Portuguese only; warm, friendly voice.",
        "avoid_references": ["pt-PT vocabulary", "minors in imagery"],
    },
    "DE": {
        "primary_sport": "Bundesliga football",
        "idiomatic_guidance": "Hochdeutsch; calm, factual tone; no hype.",
        "avoid_references": ["live broadcast tone", "excitement spikes", "specific odds"],
    },
    "FR": {
        "primary_sport": "Ligue 1 football; rugby / tennis secondary",
        "idiomatic_guidance": "Standard French; neutral energy.",
        "avoid_references": ["alcohol co-occurrence", "minors"],
    },
    "PH": {
        "primary_sport": "basketball (PBA / NBA); boxing secondary",
        "idiomatic_guidance": "Filipino English or Tagalog; warm, conversational.",
        "avoid_references": ["minors", "school/church proximity"],
    },
    "IN": {
        "primary_sport": "cricket (IPL, international)",
        "idiomatic_guidance": "Indian English; clear enunciation; cricket-aware.",
        "avoid_references": ["minors", "blocked states"],
    },
    "NG": {
        "primary_sport": "association football (Premier League, AFCON, Super Eagles)",
        "idiomatic_guidance": (
            "Nigerian English; energetic but measured; avoid guarantee framing."
        ),
        "avoid_references": [
            "active Super Eagles players without license",
            "youth culture targeting",
            "sites near schools / religious venues",
        ],
    },
}


async def build_market_compliance_for(
    session: AsyncSession,
    *,
    brand_id: uuid.UUID,
    market: str,
    sub_market: str | None,
) -> tuple[dict, list[EffectiveRule]]:
    """Return (compliance_dict, effective_rules) for feeding PromptContext."""

    markets_filter = [market, "*"]
    if sub_market:
        markets_filter.append(sub_market)

    system_rules = list(
        (
            await session.execute(
                select(ComplianceRule).where(
                    ComplianceRule.market.in_(markets_filter),
                    ComplianceRule.is_active.is_(True),
                )
            )
        )
        .scalars()
        .all()
    )
    brand_overrides = list(
        (
            await session.execute(
                select(BrandRuleOverride).where(
                    BrandRuleOverride.brand_id == brand_id,
                    BrandRuleOverride.is_active.is_(True),
                )
            )
        )
        .scalars()
        .all()
    )
    effective = compile_effective_rules(
        system_rules=system_rules, brand_overrides=brand_overrides
    )

    forbidden: list[str] = []
    required: list[str] = []
    restrictions: list[str] = []

    for rule in effective:
        if not rule.is_active:
            continue
        conditions = (rule.trigger or {}).get("conditions") or {}
        if rule.category is RuleCategory.forbidden_word:
            for phrase in conditions.get("phrases") or []:
                forbidden.append(phrase)
        elif rule.category is RuleCategory.required_element:
            required.append(rule.title)
        else:
            restrictions.append(rule.title)

    # Sub-market prompt_overrides can add forbidden_terms too.
    if sub_market:
        sm = await session.get(SubMarket, sub_market)
        if sm and sm.prompt_overrides:
            for t in sm.prompt_overrides.get("forbidden_terms", []) or []:
                if t not in forbidden:
                    forbidden.append(t)
            for t in sm.prompt_overrides.get("required_tone_adjustments", []) or []:
                restrictions.append(t)

    return {
        "forbidden_words": forbidden,
        "required_elements": required,
        "restrictions": restrictions,
    }, effective


def market_culture_for(market: str) -> dict:
    return _CULTURE.get(market, {})
