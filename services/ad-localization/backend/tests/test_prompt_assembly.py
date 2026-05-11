from __future__ import annotations

from app.prompt_assembly import PromptContext, UseCase, assemble


def _ctx(use_case: UseCase, **overrides) -> PromptContext:
    base = dict(use_case=use_case, market="DE")
    base.update(overrides)
    return PromptContext(**base)


def test_text_literal_has_base_and_language() -> None:
    final, trace = assemble(_ctx(UseCase.TEXT_LITERAL_TRANSLATE, source_content={"text": "18+ T&Cs apply"}))
    assert "faithful translator" in final.system_prompt
    assert "de-DE" in final.system_prompt
    # BaseLayer forces temperature 0 for literal translate
    assert final.forced_params.get("temperature") == 0.0
    # Trace should include every applied layer
    layers = [l.layer_name for l in trace.layers_applied]
    assert "BaseLayer" in layers
    assert "MarketLanguageLayer" in layers
    assert "MarketComplianceLayer" in layers


def test_image_text_replace_always_anchors_source() -> None:
    final, _ = assemble(
        _ctx(
            UseCase.IMAGE_TEXT_REPLACE,
            mask_region={"type": "bbox", "bbox": [10, 10, 100, 40]},
            font_info={"font_postscript_name": "Helvetica-Bold", "size_pt": 24},
            source_content={"text": "BET NOW"},
        )
    )
    # SourceAnchorLayer must contribute preservation directives for every edit.
    assert "perceptual_hash_match_required_outside_mask" in final.preservation_directives
    assert any("Mask" in d or "mask" in d for d in final.user_prompt.split("\n"))
    assert final.mask_constraints  # non-empty


def test_video_audio_replace_locks_video() -> None:
    final, _ = assemble(_ctx(UseCase.VIDEO_AUDIO_REPLACE, market="DE", source_content={"transcript": "..."}))
    assert "video_frames_bit_identical" in final.preservation_directives
    assert final.audio_prompt
    assert "Hochdeutsch" in final.audio_prompt  # market audio layer kicked in


def test_market_compliance_always_applies_and_is_last() -> None:
    final, trace = assemble(
        _ctx(
            UseCase.TEXT_TRANSCREATE,
            market="NG",
            market_compliance={"forbidden_words": ["guaranteed win", "no risk"]},
            source_content={"text": "Place your bet"},
        )
    )
    # compliance layer mention must appear in the system prompt
    assert "FORBIDDEN WORDS" in final.system_prompt
    # Priority — MarketComplianceLayer should be last in trace order
    assert trace.layers_applied[-1].layer_name == "MarketComplianceLayer"


def test_brand_restrictions_emits_negative_additions() -> None:
    final, _ = assemble(
        _ctx(
            UseCase.TEXT_TRANSCREATE,
            market="UK",
            brand_restrictions={
                "forbidden_elements": [{"element": "free bet", "reason": "UKGC"}],
                "competitor_brands": ["CompetitorX"],
            },
            source_content={"text": "x"},
        )
    )
    assert "CompetitorX" in (final.negative_prompt or "")
    assert "free bet" in (final.negative_prompt or "")


def test_token_budget_trims_fewshot_first() -> None:
    examples = [
        {"source": "a" * 1000, "target": "b" * 1000} for _ in range(50)
    ]
    final, _ = assemble(
        _ctx(
            UseCase.TEXT_TRANSCREATE,
            market="DE",
            few_shot_examples=examples,
            source_content={"text": "y"},
        ),
        token_budget=500,
    )
    # Few-shot should have been dropped under tight budget
    assert final.few_shot_examples == []
