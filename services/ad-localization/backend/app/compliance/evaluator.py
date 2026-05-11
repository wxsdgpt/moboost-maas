"""Rule evaluator.

Accepts an EvaluationTarget (assembled content from a LocalizedAsset — text
segments with LU ids, metadata, optional image/audio) and a list of effective
rules. Runs each rule's trigger DSL and produces Findings.

Trigger types supported in V1:
  - text_match           (substring, list of phrases, case-insensitive option)
  - regex                (Python regex; configurable flags)
  - metadata_check       (field presence / equality / set membership)
Vision + audio detection trigger types are defined but delegated to the AI
service (out-of-process); the evaluator records them as 'deferred' findings
so the pipeline can decide when to run the costly checks.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field
from typing import Any

from app.compliance.effective_rules import EffectiveRule
from app.logging import get_logger
from app.models.enums import Severity

log = get_logger(__name__)


@dataclass
class TextSegment:
    lu_id: uuid.UUID | None
    semantic_role: str | None
    text: str
    language: str | None = None


@dataclass
class EvaluationTarget:
    market: str
    sub_market: str | None
    text_segments: list[TextSegment] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
    # Optional heavy artifacts for later (image/audio AI checks)
    image_bytes: bytes | None = None
    video_bytes: bytes | None = None

    @property
    def target_tag(self) -> str:
        return self.sub_market or self.market


@dataclass
class Finding:
    rule_id: uuid.UUID | str
    rule_code: str
    rule_version: int
    severity: Severity
    message: str
    suggested_fix: str | None
    regulation_reference: str | None
    detected_content: str | None = None
    trigger_location: dict | None = None
    reason_required: bool = False
    deferred: bool = False  # needs out-of-process check (vision, audio)


def evaluate(target: EvaluationTarget, rules: list[EffectiveRule]) -> list[Finding]:
    findings: list[Finding] = []

    applicable = [r for r in rules if _applies(r, target)]
    for rule in applicable:
        f = _run_rule(rule, target)
        findings.extend(f)

    return findings


def _applies(rule: EffectiveRule, target: EvaluationTarget) -> bool:
    if not rule.is_active:
        return False
    # rule.market may be a parent market ("DE") or a sub-market id ("US-NJ")
    if rule.market == target.sub_market or rule.market == target.market:
        return True
    return False


def _run_rule(rule: EffectiveRule, target: EvaluationTarget) -> list[Finding]:
    ttype = (rule.trigger or {}).get("type")
    if ttype == "text_match":
        return _text_match(rule, target)
    if ttype == "regex":
        return _regex(rule, target)
    if ttype == "metadata_check":
        return _metadata(rule, target)
    if ttype in {"image_detection", "audio_detection"}:
        # Emit a deferred finding so callers know a heavy check is needed.
        return [
            Finding(
                rule_id=rule.id,
                rule_code=rule.code,
                rule_version=rule.version,
                severity=rule.severity,
                message=rule.message,
                suggested_fix=rule.suggested_fix,
                regulation_reference=rule.regulation_reference,
                reason_required=rule.reason_required,
                deferred=True,
            )
        ]
    log.warning("compliance.unknown_trigger", trigger=ttype, rule=rule.code)
    return []


def _text_match(rule: EffectiveRule, target: EvaluationTarget) -> list[Finding]:
    conditions = rule.trigger.get("conditions", {}) or {}
    phrases: list[str] = conditions.get("phrases") or []
    case_sensitive: bool = bool(conditions.get("case_sensitive", False))
    restricted_roles: list[str] | None = conditions.get("applies_to_roles")

    findings: list[Finding] = []
    for seg in target.text_segments:
        if restricted_roles and seg.semantic_role not in restricted_roles:
            continue
        haystack = seg.text if case_sensitive else seg.text.lower()
        for phrase in phrases:
            needle = phrase if case_sensitive else phrase.lower()
            if needle and needle in haystack:
                findings.append(
                    Finding(
                        rule_id=rule.id,
                        rule_code=rule.code,
                        rule_version=rule.version,
                        severity=rule.severity,
                        message=rule.message,
                        suggested_fix=rule.suggested_fix,
                        regulation_reference=rule.regulation_reference,
                        reason_required=rule.reason_required,
                        detected_content=phrase,
                        trigger_location={
                            "lu_id": str(seg.lu_id) if seg.lu_id else None,
                            "phrase": phrase,
                        },
                    )
                )
    return findings


def _regex(rule: EffectiveRule, target: EvaluationTarget) -> list[Finding]:
    conditions = rule.trigger.get("conditions", {}) or {}
    pattern = conditions.get("pattern")
    if not pattern:
        return []
    flags = 0
    if conditions.get("ignorecase", False):
        flags |= re.IGNORECASE
    compiled = re.compile(pattern, flags)
    restricted_roles: list[str] | None = conditions.get("applies_to_roles")
    findings: list[Finding] = []
    for seg in target.text_segments:
        if restricted_roles and seg.semantic_role not in restricted_roles:
            continue
        for m in compiled.finditer(seg.text):
            findings.append(
                Finding(
                    rule_id=rule.id,
                    rule_code=rule.code,
                    rule_version=rule.version,
                    severity=rule.severity,
                    message=rule.message,
                    suggested_fix=rule.suggested_fix,
                    regulation_reference=rule.regulation_reference,
                    reason_required=rule.reason_required,
                    detected_content=m.group(0),
                    trigger_location={
                        "lu_id": str(seg.lu_id) if seg.lu_id else None,
                        "span": [m.start(), m.end()],
                    },
                )
            )
    return findings


def _metadata(rule: EffectiveRule, target: EvaluationTarget) -> list[Finding]:
    conditions = rule.trigger.get("conditions", {}) or {}
    op = conditions.get("op", "present")
    field_name = conditions.get("field")
    if not field_name:
        return []

    value = _get_nested(target.metadata, field_name)
    violated = False
    detail: str | None = None

    if op == "required" and not value:
        violated = True
        detail = f"{field_name} missing"
    elif op == "equals":
        expected = conditions.get("value")
        violated = value != expected
        detail = f"{field_name}={value!r}, expected {expected!r}"
    elif op == "in":
        allowed = conditions.get("values") or []
        violated = value not in allowed
        detail = f"{field_name}={value!r} not in {allowed}"
    elif op == "absent":
        violated = bool(value)
        detail = f"{field_name} should be absent"

    if not violated:
        return []
    return [
        Finding(
            rule_id=rule.id,
            rule_code=rule.code,
            rule_version=rule.version,
            severity=rule.severity,
            message=rule.message,
            suggested_fix=rule.suggested_fix,
            regulation_reference=rule.regulation_reference,
            reason_required=rule.reason_required,
            detected_content=detail,
            trigger_location={"field": field_name},
        )
    ]


def _get_nested(data: dict, path: str):
    cur: Any = data
    for key in path.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(key)
    return cur
