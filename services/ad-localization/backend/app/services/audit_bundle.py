"""Regulatory audit-package builder.

When a regulator asks "what went out on date X, and under what rules / who
signed off?", we ship a self-contained zip with:
  - source asset + hash
  - localized output + hash
  - every AIGenerationLog entry (with full assembly trace)
  - the compliance report at confirmation time
  - the AssetConfirmation record (who, when, what they saw, what reasons)
  - the effective-rules snapshot (system + brand overrides)
  - a manifest.json linking everything
"""

from __future__ import annotations

import io
import json
import uuid
import zipfile
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AIGenerationLog,
    AssetConfirmation,
    ComplianceCheckReport,
    LocalizedAsset,
    ParsedAsset,
    SourceAsset,
)
from app.storage import get_storage


async def build_regulatory_package(
    session: AsyncSession, localized_asset_id: uuid.UUID
) -> bytes:
    asset = await session.get(LocalizedAsset, localized_asset_id)
    if asset is None:
        raise LookupError("localized asset not found")

    source = await session.get(SourceAsset, asset.source_asset_id)
    if source is None:
        raise LookupError("source asset missing")

    parsed = (
        await session.execute(
            select(ParsedAsset).where(ParsedAsset.source_asset_id == source.id)
        )
    ).scalar_one_or_none()

    report = (
        await session.get(ComplianceCheckReport, asset.compliance_report_id)
        if asset.compliance_report_id
        else None
    )
    confirmation = (
        await session.get(AssetConfirmation, asset.confirmation_id)
        if asset.confirmation_id
        else None
    )

    ai_logs = list(
        (
            await session.execute(
                select(AIGenerationLog)
                .where(AIGenerationLog.localized_asset_id == asset.id)
                .order_by(AIGenerationLog.created_at)
            )
        )
        .scalars()
        .all()
    )

    storage = get_storage()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # manifest
        manifest = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "localized_asset_id": str(asset.id),
            "source_asset_id": str(source.id),
            "target_market": asset.target_market.value,
            "target_sub_market": asset.target_sub_market,
            "output_hash": asset.output_file_hash,
            "source_hash": source.source_file_hash,
            "compliance_report_id": str(asset.compliance_report_id) if asset.compliance_report_id else None,
            "confirmation_id": str(asset.confirmation_id) if asset.confirmation_id else None,
            "ai_call_count": len(ai_logs),
        }
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))

        # source + output assets
        try:
            source_bytes = await storage.get(source.storage_key)
            zf.writestr(f"source/{source.original_filename}", source_bytes)
        except Exception as e:  # noqa: BLE001
            zf.writestr("source/README-missing.txt", f"source asset unavailable: {e}")
        if asset.output_storage_key:
            try:
                out_bytes = await storage.get(asset.output_storage_key)
                zf.writestr(f"output/{asset.id}.bin", out_bytes)
            except Exception as e:  # noqa: BLE001
                zf.writestr("output/README-missing.txt", f"output unavailable: {e}")

        # parsed asset + LUs
        if parsed is not None:
            zf.writestr(
                "parse/parsed_asset.json",
                json.dumps(
                    {
                        "id": str(parsed.id),
                        "parse_method": parsed.parse_method,
                        "parse_model_used": parsed.parse_model_used,
                        "structural_metadata": parsed.structural_metadata,
                        "parse_warnings": parsed.parse_warnings,
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
            )

        # compliance report
        if report is not None:
            zf.writestr(
                "compliance/report.json",
                json.dumps(
                    {
                        "id": str(report.id),
                        "rule_snapshot_version": report.rule_snapshot_version,
                        "overall_status": report.overall_status,
                        "findings": report.findings,
                        "ai_vision_checks": report.ai_vision_checks,
                        "change_minimization": report.change_minimization,
                        "checked_at": report.created_at.isoformat(),
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
            )

        # confirmation
        if confirmation is not None:
            zf.writestr(
                "compliance/confirmation.json",
                json.dumps(
                    {
                        "id": str(confirmation.id),
                        "confirmed_by": str(confirmation.confirmed_by),
                        "confirmed_at": confirmation.created_at.isoformat(),
                        "effective_rules_snapshot_hash": confirmation.effective_rules_snapshot_hash,
                        "acknowledgments": confirmation.acknowledgments,
                        "brand_override_state": confirmation.brand_override_state,
                        "comments": confirmation.comments,
                        "ip_address": confirmation.ip_address,
                        "user_agent": confirmation.user_agent,
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
            )

        # AI logs (complete assembly trace per call)
        for log in ai_logs:
            zf.writestr(
                f"ai_logs/{log.id}.json",
                json.dumps(
                    {
                        "id": str(log.id),
                        "use_case": log.use_case,
                        "model": log.model.value,
                        "provider_model_id": log.provider_model_id,
                        "assembly_trace": log.assembly_trace,
                        "output_text": log.output_text,
                        "tokens_input": log.tokens_input,
                        "tokens_output": log.tokens_output,
                        "cost_usd": str(log.cost_usd),
                        "cache_hit": log.cache_hit,
                        "verification": log.verification,
                        "status": log.status.value,
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
            )

    return buf.getvalue()
