"""AssetConfirmation creation + acknowledgment validation.

Per COMPLIANCE_GOVERNANCE.md:
  - Every confirmation is immutable.
  - Every 'reason_required' finding must carry a reason of min length.
  - Confirmation snapshots the full effective-rule hash at that moment.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AssetConfirmation,
    BrandReasonRequirementConfig,
    ComplianceCheckReport,
    LocalizedAsset,
    SourceAsset,
)
from app.models.enums import LocalizedAssetStatus

DEFAULT_MIN_REASON_LENGTH = 30


async def confirm_asset(
    session: AsyncSession,
    *,
    localized_asset_id: uuid.UUID,
    confirmed_by: uuid.UUID,
    acknowledgments: list[dict],
    comments: list[str],
    ip_address: str | None,
    user_agent: str | None,
) -> AssetConfirmation:
    asset = await session.get(LocalizedAsset, localized_asset_id)
    if asset is None:
        raise LookupError("localized asset not found")

    if asset.status in (
        LocalizedAssetStatus.confirmed,
        LocalizedAssetStatus.distributed,
    ):
        raise ValueError(f"already {asset.status.value}")
    if asset.compliance_report_id is None:
        raise ValueError("run compliance check first")

    report = await session.get(ComplianceCheckReport, asset.compliance_report_id)
    if report is None:
        raise LookupError("compliance report missing")

    source = await session.get(SourceAsset, asset.source_asset_id)
    if source is None:
        raise LookupError("orphaned asset")

    # Look up the brand's reason-required config
    config_result = await session.execute(
        select(BrandReasonRequirementConfig).where(
            BrandReasonRequirementConfig.brand_id == source.brand_id
        )
    )
    config = config_result.scalar_one_or_none()
    min_len = config.min_reason_length if config else DEFAULT_MIN_REASON_LENGTH

    # Validate that every reason-required finding was acknowledged with a reason.
    ack_by_rule: dict[str, dict] = {a["rule_id"]: a for a in acknowledgments}
    errors: list[str] = []
    for finding in report.findings or []:
        rule_id = str(finding["rule_id"])
        if not finding.get("reason_required"):
            continue
        ack = ack_by_rule.get(rule_id)
        if ack is None:
            errors.append(f"finding {finding['rule_code']} not acknowledged")
            continue
        reason = (ack.get("reason_provided") or "").strip()
        if len(reason) < min_len:
            errors.append(
                f"reason for {finding['rule_code']} below minimum length ({min_len})"
            )
        if reason in {".", "x", "n/a", "na", "ok"}:
            errors.append(f"reason for {finding['rule_code']} is spam")

    if errors:
        raise ValueError("; ".join(errors))

    confirmation = AssetConfirmation(
        localized_asset_id=asset.id,
        confirmed_by=confirmed_by,
        compliance_report_snapshot={
            "id": str(report.id),
            "overall_status": report.overall_status,
            "findings": report.findings,
            "rule_snapshot_version": report.rule_snapshot_version,
        },
        effective_rules_snapshot_hash=report.rule_snapshot_version,
        acknowledgments=[
            {
                **a,
                "acknowledged_at": datetime.now(timezone.utc).isoformat(),
                "reason_length": len((a.get("reason_provided") or "")),
            }
            for a in acknowledgments
        ],
        brand_override_state={},  # populated in Phase 5 reporting
        comments=[{"content": c} for c in comments],
        ip_address=ip_address,
        user_agent=user_agent,
    )
    session.add(confirmation)
    await session.flush()

    asset.status = LocalizedAssetStatus.confirmed
    asset.confirmation_id = confirmation.id
    return confirmation
