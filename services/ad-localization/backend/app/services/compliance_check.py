"""Run the full compliance check for a LocalizedAsset:

  1. Load system rules for (parent market + sub-market).
  2. Load active brand overrides.
  3. Compile effective rule set.
  4. Build EvaluationTarget from LocalizedAsset content (text segments from
     its unit_outputs + metadata flags from overlays / distribution).
  5. Evaluate and persist a ComplianceCheckReport.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.compliance import EffectiveRule, compile_effective_rules
from app.compliance.evaluator import EvaluationTarget, Finding, TextSegment, evaluate
from app.models import (
    BrandRuleOverride,
    ComplianceCheckReport,
    ComplianceRule,
    LocalizedAsset,
    ParsedAsset,
    SourceAsset,
)
from app.models.enums import LocalizedAssetStatus, Severity


async def run_check(
    session: AsyncSession, localized_asset_id: uuid.UUID
) -> tuple[ComplianceCheckReport, list[Finding], list[EffectiveRule]]:
    asset = await session.get(LocalizedAsset, localized_asset_id)
    if asset is None:
        raise LookupError(f"localized asset {localized_asset_id} not found")
    source = await session.get(SourceAsset, asset.source_asset_id)
    if source is None:
        raise LookupError("orphaned localized asset")

    target = await _build_target(session, asset)

    # Load system rules applicable to either the parent market or the sub-market,
    # plus "*" cross-market rules.
    markets_filter = [asset.target_market.value]
    if asset.target_sub_market:
        markets_filter.append(asset.target_sub_market)
    markets_filter.append("*")
    rules_result = await session.execute(
        select(ComplianceRule).where(
            ComplianceRule.market.in_(markets_filter), ComplianceRule.is_active.is_(True)
        )
    )
    system_rules = list(rules_result.scalars().all())

    overrides_result = await session.execute(
        select(BrandRuleOverride).where(
            BrandRuleOverride.brand_id == source.brand_id,
            BrandRuleOverride.is_active.is_(True),
        )
    )
    brand_overrides = list(overrides_result.scalars().all())

    effective = compile_effective_rules(
        system_rules=system_rules, brand_overrides=brand_overrides
    )
    # Cross-market rules (market=="*") apply universally — let the evaluator
    # see them by rewriting their market to match the target's.
    for r in effective:
        if r.market == "*":
            r.market = target.sub_market or target.market

    findings = evaluate(target, effective)

    overall = _overall_status(findings)
    snapshot_hash = _hash_rules(effective)
    report = ComplianceCheckReport(
        localized_asset_id=asset.id,
        rule_snapshot_version=snapshot_hash[:16],
        overall_status=overall,
        findings=[_finding_to_json(f) for f in findings],
        ai_vision_checks={},
        change_minimization={},
        human_review_required=any(f.severity is Severity.critical for f in findings),
    )
    session.add(report)
    await session.flush()

    asset.compliance_report_id = report.id
    asset.status = LocalizedAssetStatus.awaiting_confirmation

    return report, findings, effective


async def _build_target(
    session: AsyncSession, asset: LocalizedAsset
) -> EvaluationTarget:
    segments: list[TextSegment] = []
    for out in asset.unit_outputs or []:
        # Prefer the AI-produced target text; fall back to source text.
        txt = (
            (out.get("output_content") or {}).get("text")
            or (out.get("output_content") or {}).get("target_text")
            or (out.get("source_text"))
            or ""
        )
        if not txt:
            continue
        segments.append(
            TextSegment(
                lu_id=uuid.UUID(out["lu_id"]) if out.get("lu_id") else None,
                semantic_role=out.get("semantic_role"),
                text=txt,
                language=out.get("language"),
            )
        )

    # Distribution / overlay metadata lives on LocalizedAsset.platform_metadata
    meta = {
        "overlays": (asset.platform_metadata or {}).get("overlays", {}),
        "distribution": {
            "time_window_deferred": (asset.platform_metadata or {}).get("allowed_time_windows"),
            "excludes_sensitive_sites": (asset.platform_metadata or {}).get(
                "excludes_sensitive_sites"
            ),
        },
    }
    return EvaluationTarget(
        market=asset.target_market.value,
        sub_market=asset.target_sub_market,
        text_segments=segments,
        metadata=meta,
    )


def _overall_status(findings: list[Finding]) -> str:
    if any(f.severity is Severity.critical for f in findings):
        return "warnings"  # per docs: all advisory, never 'blocked'
    if findings:
        return "warnings"
    return "passed"


def _hash_rules(rules: list[EffectiveRule]) -> str:
    payload = json.dumps(
        [
            {
                "id": str(r.id),
                "code": r.code,
                "version": r.version,
                "severity": r.severity.value,
                "trigger": r.trigger,
                "origin": r.origin,
            }
            for r in sorted(rules, key=lambda r: str(r.id))
        ],
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _finding_to_json(f: Finding) -> dict:
    return {
        "rule_id": str(f.rule_id),
        "rule_code": f.rule_code,
        "rule_version": f.rule_version,
        "severity": f.severity.value,
        "message": f.message,
        "suggested_fix": f.suggested_fix,
        "regulation_reference": f.regulation_reference,
        "detected_content": f.detected_content,
        "trigger_location": f.trigger_location,
        "reason_required": f.reason_required,
        "deferred": f.deferred,
    }
