from __future__ import annotations

import uuid

from app.compliance.effective_rules import EffectiveRule
from app.compliance.evaluator import EvaluationTarget, TextSegment, evaluate
from app.models.enums import RuleCategory, Severity


def _rule(market: str, code: str, trigger: dict, severity: Severity = Severity.warning) -> EffectiveRule:
    return EffectiveRule(
        id=uuid.uuid4(),
        code=code,
        market=market,
        category=RuleCategory.forbidden_word,
        severity=severity,
        title="t",
        message="m",
        suggested_fix=None,
        trigger=trigger,
        regulation_reference=None,
        version=1,
        is_active=True,
        reason_required=False,
        origin="system",
    )


def test_text_match_detects_forbidden_phrase() -> None:
    rule = _rule("UK-GB", "uk.risk_free", {"type": "text_match", "conditions": {"phrases": ["risk-free", "risk free"]}})
    target = EvaluationTarget(
        market="UK",
        sub_market="UK-GB",
        text_segments=[TextSegment(lu_id=uuid.uuid4(), semantic_role="headline", text="Our RISK-FREE bet is back!")],
    )
    findings = evaluate(target, [rule])
    assert len(findings) == 1
    assert findings[0].detected_content.lower() == "risk-free"


def test_regex_respects_roles() -> None:
    rule = _rule(
        "DE",
        "de.odds_numeric",
        {
            "type": "regex",
            "conditions": {
                "pattern": r"(?<![\w])(?:\+|\-)?\d{1,3}(?:[.,]\d{1,2})?(?![\w])",
                "applies_to_roles": ["odds"],
            },
        },
        severity=Severity.critical,
    )
    target = EvaluationTarget(
        market="DE",
        sub_market=None,
        text_segments=[
            TextSegment(lu_id=uuid.uuid4(), semantic_role="odds", text="Odds 2.5"),
            TextSegment(lu_id=uuid.uuid4(), semantic_role="headline", text="Bet on the 99 best games"),
        ],
    )
    findings = evaluate(target, [rule])
    # Headline mentions 99 but role restriction keeps it out.
    assert len(findings) == 1
    assert findings[0].trigger_location["lu_id"] is not None


def test_metadata_required_missing_raises_finding() -> None:
    rule = _rule(
        "UK-GB",
        "uk.begambleaware",
        {"type": "metadata_check", "conditions": {"op": "required", "field": "overlays.begambleaware"}},
        severity=Severity.critical,
    )
    missing = EvaluationTarget(market="UK", sub_market="UK-GB", metadata={})
    present = EvaluationTarget(
        market="UK", sub_market="UK-GB", metadata={"overlays": {"begambleaware": True}}
    )
    assert len(evaluate(missing, [rule])) == 1
    assert evaluate(present, [rule]) == []


def test_rule_applies_to_parent_or_sub_market_only() -> None:
    rule = _rule("US-TN", "us-tn.free_bet", {"type": "text_match", "conditions": {"phrases": ["free bet"]}})
    # Non-TN target gets no findings
    not_tn = EvaluationTarget(
        market="US",
        sub_market="US-NJ",
        text_segments=[TextSegment(lu_id=None, semantic_role=None, text="Free bet today")],
    )
    tn = EvaluationTarget(
        market="US",
        sub_market="US-TN",
        text_segments=[TextSegment(lu_id=None, semantic_role=None, text="Free bet today")],
    )
    assert evaluate(not_tn, [rule]) == []
    assert len(evaluate(tn, [rule])) == 1


def test_image_audio_rules_flagged_deferred() -> None:
    rule = _rule(
        "DE",
        "de.excitement_tone",
        {"type": "audio_detection", "conditions": {"check": "excitement_level", "max": 0.3}},
    )
    target = EvaluationTarget(market="DE", sub_market=None)
    findings = evaluate(target, [rule])
    assert len(findings) == 1
    assert findings[0].deferred is True
