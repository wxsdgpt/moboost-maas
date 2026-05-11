from __future__ import annotations

import uuid

from app.models import Brand, LocalizableUnit
from app.models.enums import LUType, SemanticRole
from app.services.strategy_resolver import (
    LocalizationTarget,
    default_audio_strategy,
    default_text_strategy,
    default_visual_strategy,
)


def _text_lu(role: SemanticRole | None = None, text: str = "Bet now") -> LocalizableUnit:
    lu = LocalizableUnit(
        id=uuid.uuid4(),
        lu_type=LUType.text,
        source_content={"text": text, "language": "en"},
        source_location={},
        semantic_role=role,
    )
    return lu


def _visual_lu(role: SemanticRole | None = None, markers: list[str] | None = None) -> LocalizableUnit:
    return LocalizableUnit(
        id=uuid.uuid4(),
        lu_type=LUType.visual,
        source_content={
            "description": "x",
            "element_type": "person",
            "detected_attributes": {"cultural_markers": markers or []},
        },
        source_location={},
        semantic_role=role,
    )


def _audio_lu(audio_type: str) -> LocalizableUnit:
    return LocalizableUnit(
        id=uuid.uuid4(),
        lu_type=LUType.audio,
        source_content={"audio_type": audio_type},
        source_location={},
    )


def _brand(lock: bool = True) -> Brand:
    return Brand(
        id=uuid.uuid4(),
        name="X",
        slug="x",
        display_name_by_market={},
        restrictions={},
        voice={},
        lock_brand_name=lock,
    )


class TestTextStrategy:
    def test_legal_always_literal(self) -> None:
        lu = _text_lu(SemanticRole.legal)
        for market in ("US", "DE", "BR", "FR", "NG"):
            assert (
                default_text_strategy(lu, LocalizationTarget(market)).value
                == "literal_translate"
            )

    def test_brand_name_kept_when_brand_lock(self) -> None:
        lu = _text_lu(SemanticRole.brand_name)
        assert default_text_strategy(lu, LocalizationTarget("DE"), _brand(True)).value == "keep_original"

    def test_headline_transcreated_in_high_risk_markets(self) -> None:
        lu = _text_lu(SemanticRole.headline)
        for m in ("DE", "UK", "FR"):
            assert default_text_strategy(lu, LocalizationTarget(m)).value == "transcreate"

    def test_headline_literal_in_other_markets(self) -> None:
        lu = _text_lu(SemanticRole.headline)
        # BR is not high-risk creative → literal
        assert default_text_strategy(lu, LocalizationTarget("BR")).value == "literal_translate"

    def test_cta_light_localize_default(self) -> None:
        lu = _text_lu(SemanticRole.cta)
        assert default_text_strategy(lu, LocalizationTarget("BR")).value == "light_localize"

    def test_us_tn_forces_transcreate_on_cta(self) -> None:
        lu = _text_lu(SemanticRole.cta)
        out = default_text_strategy(lu, LocalizationTarget("US", "US-TN")).value
        assert out == "transcreate"

    def test_english_market_keeps_original_for_non_creative(self) -> None:
        lu = _text_lu(SemanticRole.body)
        assert default_text_strategy(lu, LocalizationTarget("PH")).value == "keep_original"


class TestVisualStrategy:
    def test_logo_kept(self) -> None:
        lu = _visual_lu(SemanticRole.logo)
        assert default_visual_strategy(lu, LocalizationTarget("DE")).value == "keep_original"

    def test_ng_swaps_american_football(self) -> None:
        lu = _visual_lu(markers=["American football"])
        assert default_visual_strategy(lu, LocalizationTarget("NG")).value == "localize_culturally"

    def test_de_persons_replace_for_compliance(self) -> None:
        lu = _visual_lu(SemanticRole.person)
        assert default_visual_strategy(lu, LocalizationTarget("DE")).value == "replace_for_compliance"


class TestAudioStrategy:
    def test_music_kept(self) -> None:
        lu = _audio_lu("music")
        assert default_audio_strategy(lu, LocalizationTarget("DE")).value == "keep_original"

    def test_dialogue_in_english_market_kept(self) -> None:
        lu = _audio_lu("dialogue")
        assert default_audio_strategy(lu, LocalizationTarget("NG")).value == "keep_original"

    def test_dialogue_in_br_gets_subtitles(self) -> None:
        lu = _audio_lu("dialogue")
        assert default_audio_strategy(lu, LocalizationTarget("BR")).value == "add_subtitles_only"
