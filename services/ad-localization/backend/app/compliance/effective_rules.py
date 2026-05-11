"""Compile the effective rule set for a (brand, market) pair.

    effective = system_defaults + brand_overrides

Overrides can add, tighten, relax, or disable system rules. This module does
not do any I/O beyond what callers pass in — it's pure merge logic so it can
be unit-tested.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Iterable

from app.logging import get_logger
from app.models import BrandRuleOverride, ComplianceRule
from app.models.enums import OverrideType, RuleCategory, Severity

log = get_logger(__name__)


@dataclass
class EffectiveRule:
    id: uuid.UUID | str
    code: str
    market: str
    category: RuleCategory
    severity: Severity
    title: str
    message: str
    suggested_fix: str | None
    trigger: dict
    regulation_reference: str | None
    version: int
    is_active: bool
    reason_required: bool
    origin: str  # "system" | "brand_add" | "tightened" | "relaxed"
    overridden_by: uuid.UUID | None = None

    @classmethod
    def from_system(cls, rule: ComplianceRule) -> "EffectiveRule":
        return cls(
            id=rule.id,
            code=rule.code,
            market=rule.market,
            category=rule.category,
            severity=rule.severity,
            title=rule.title,
            message=rule.message,
            suggested_fix=rule.suggested_fix,
            trigger=rule.trigger or {},
            regulation_reference=rule.regulation_reference,
            version=rule.version,
            is_active=rule.is_active,
            reason_required=rule.reason_required_by_default,
            origin="system",
        )


def compile_effective_rules(
    *,
    system_rules: Iterable[ComplianceRule],
    brand_overrides: Iterable[BrandRuleOverride],
) -> list[EffectiveRule]:
    override_by_rule: dict[uuid.UUID, BrandRuleOverride] = {
        o.system_rule_id: o
        for o in brand_overrides
        if o.system_rule_id is not None and o.is_active
    }

    out: list[EffectiveRule] = []

    for rule in system_rules:
        override = override_by_rule.get(rule.id)
        if override is None:
            out.append(EffectiveRule.from_system(rule))
            continue
        if override.override_type is OverrideType.disable:
            log.info(
                "compliance.rule_disabled_by_brand",
                rule_code=rule.code,
                override_id=str(override.id),
            )
            continue
        if override.override_type in (OverrideType.tighten, OverrideType.relax):
            out.append(_merge(rule, override))
            continue

    for override in brand_overrides:
        if override.override_type is OverrideType.add and override.is_active:
            defn = override.new_rule_definition or {}
            out.append(
                EffectiveRule(
                    id=override.id,
                    code=defn.get("code") or f"brand:{override.id}",
                    market=defn.get("market") or "-",
                    category=RuleCategory(
                        defn.get("category", RuleCategory.forbidden_word.value)
                    ),
                    severity=Severity(defn.get("severity", Severity.warning.value)),
                    title=defn.get("title") or "(brand-added rule)",
                    message=defn.get("message") or "(brand-added rule)",
                    suggested_fix=defn.get("suggested_fix"),
                    trigger=defn.get("trigger") or {},
                    regulation_reference=defn.get("regulation_reference"),
                    version=override.version,
                    is_active=True,
                    reason_required=bool(defn.get("reason_required_by_default", False)),
                    origin="brand_add",
                    overridden_by=override.id,
                )
            )

    return out


def _merge(rule: ComplianceRule, override: BrandRuleOverride) -> EffectiveRule:
    mods = override.modifications or {}
    sev = Severity(mods["severity"]) if mods.get("severity") else rule.severity
    message = mods.get("message_override") or rule.message
    reason_required = (
        mods["reason_required_override"]
        if mods.get("reason_required_override") is not None
        else rule.reason_required_by_default
    )
    trigger = rule.trigger or {}
    if mods.get("trigger_conditions"):
        merged_trigger = dict(trigger)
        merged_conditions = dict(merged_trigger.get("conditions", {}))
        merged_conditions.update(mods["trigger_conditions"])
        merged_trigger["conditions"] = merged_conditions
        trigger = merged_trigger

    origin = "tightened" if override.override_type is OverrideType.tighten else "relaxed"
    return EffectiveRule(
        id=rule.id,
        code=rule.code,
        market=rule.market,
        category=rule.category,
        severity=sev,
        title=rule.title,
        message=message,
        suggested_fix=rule.suggested_fix,
        trigger=trigger,
        regulation_reference=rule.regulation_reference,
        version=max(rule.version, override.version),
        is_active=True,
        reason_required=reason_required,
        origin=origin,
        overridden_by=override.id,
    )
