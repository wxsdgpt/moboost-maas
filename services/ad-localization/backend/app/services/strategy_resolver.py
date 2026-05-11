"""Default Strategy Resolver.

Given a LocalizableUnit + target market + brand context, returns the default
strategy the user should see pre-filled in the Strategy Matrix. Users can
change cells freely — this resolver just seeds them with sensible defaults.

Implements the rules from LOCALIZABLE_UNITS.md §"Smart Default Strategy Resolution"
plus sub-market-specific tweaks (DE odds block, US-TN free-bet transcreate, etc.).

Pure logic: no I/O, no DB. Fully unit-tested.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.models import Brand, LocalizableUnit
from app.models.enums import (
    AudioStrategy,
    LUType,
    SemanticRole,
    TextStrategy,
    VisualStrategy,
)


@dataclass(frozen=True)
class LocalizationTarget:
    """Atomic unit per CLAUDE.md rule #24: never pass raw market strings."""

    market: str
    sub_market: str | None = None

    @property
    def composite(self) -> str:
        return self.sub_market or self.market


_LEGAL_ROLES = {SemanticRole.legal, SemanticRole.disclaimer}
_HIGH_RISK_CREATIVE_MARKETS = {"DE", "UK", "FR"}
_ENGLISH_MARKETS = {"US", "UK", "PH", "IN", "NG"}
_CREATIVE_ROLES = {SemanticRole.headline, SemanticRole.tagline}


def default_text_strategy(
    lu: LocalizableUnit, target: LocalizationTarget, brand: Brand | None = None
) -> TextStrategy:
    assert lu.lu_type is LUType.text

    role = lu.semantic_role

    if role is SemanticRole.brand_name:
        if brand is None or brand.lock_brand_name:
            return TextStrategy.keep_original

    if role is SemanticRole.product_name:
        return TextStrategy.keep_original

    if role in _LEGAL_ROLES:
        return TextStrategy.literal_translate

    if role is SemanticRole.odds:
        # DE prohibits specific odds display entirely — user must override with transcreate
        # to either paraphrase or remove. Default stays literal so the UI flags it.
        return TextStrategy.literal_translate

    if role in _CREATIVE_ROLES and target.market in _HIGH_RISK_CREATIVE_MARKETS:
        return TextStrategy.transcreate

    if role in (SemanticRole.cta,):
        # US-TN's "free bet" ban forces transcreate for CTA copy
        if target.sub_market == "US-TN":
            return TextStrategy.transcreate
        return TextStrategy.light_localize

    # English-content markets should keep English source verbatim unless creative role demands more
    if target.market in _ENGLISH_MARKETS and role not in _CREATIVE_ROLES:
        return TextStrategy.keep_original

    return TextStrategy.literal_translate


def default_visual_strategy(
    lu: LocalizableUnit, target: LocalizationTarget, brand: Brand | None = None
) -> VisualStrategy:
    assert lu.lu_type is LUType.visual

    # Anything flagged as a logo / brand element stays put
    if lu.semantic_role is SemanticRole.logo:
        return VisualStrategy.keep_original

    # NG: football context shifts from American football to association football.
    if target.market == "NG":
        sports_hint = (
            lu.detection_metadata.get("cultural_markers")
            or lu.source_content.get("detected_attributes", {}).get("cultural_markers", [])
        )
        if sports_hint and any("american" in str(h).lower() for h in sports_hint):
            return VisualStrategy.localize_culturally

    # DE / FR with real persons trigger replace_for_compliance (celebrity rules)
    if target.market in {"DE", "FR", "UK"} and lu.semantic_role is SemanticRole.person:
        return VisualStrategy.replace_for_compliance

    return VisualStrategy.keep_original


def default_audio_strategy(
    lu: LocalizableUnit, target: LocalizationTarget, brand: Brand | None = None
) -> AudioStrategy:
    assert lu.lu_type is LUType.audio

    audio_type = lu.source_content.get("audio_type")

    # Music / sfx / ambient → keep
    if audio_type in {"music", "sfx", "ambient"}:
        return AudioStrategy.keep_original

    # Dialogue / voiceover
    # English-content markets keep English dialogue
    if target.market in _ENGLISH_MARKETS:
        return AudioStrategy.keep_original

    # Non-English markets default to subtitles-only (cheapest, reversible)
    return AudioStrategy.add_subtitles_only


def resolve_default_strategy(
    lu: LocalizableUnit, target: LocalizationTarget, brand: Brand | None = None
) -> str:
    """Dispatch by LU type. Returns the enum's string value."""
    if lu.lu_type is LUType.text:
        return default_text_strategy(lu, target, brand).value
    if lu.lu_type is LUType.visual:
        return default_visual_strategy(lu, target, brand).value
    if lu.lu_type is LUType.audio:
        return default_audio_strategy(lu, target, brand).value
    raise ValueError(f"unsupported LU type {lu.lu_type}")


def build_matrix(
    lus: list[LocalizableUnit],
    targets: list[LocalizationTarget],
    brand: Brand | None = None,
) -> dict[str, dict[str, str]]:
    """Returns { lu_id: { market_or_submarket: default_strategy } }."""
    out: dict[str, dict[str, str]] = {}
    for lu in lus:
        row: dict[str, str] = {}
        for t in targets:
            row[t.composite] = resolve_default_strategy(lu, t, brand)
        out[str(lu.id)] = row
    return out
