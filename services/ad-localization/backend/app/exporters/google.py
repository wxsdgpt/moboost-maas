from __future__ import annotations

import io
import json
import zipfile

from app.exporters.base import ExportArtifact, Exporter
from app.models import LocalizedAsset, SourceAsset, SubMarket


class GoogleAdsExporter(Exporter):
    platform = "google_ads"

    def export(
        self,
        *,
        localized: LocalizedAsset,
        source: SourceAsset,
        sub_market: SubMarket | None,
        asset_bytes: bytes,
        original_filename: str,
    ) -> ExportArtifact:
        meta = {
            "platform": "google_ads",
            "asset_id": str(localized.id),
            "source_asset_id": str(localized.source_asset_id),
            "output_hash": localized.output_file_hash,
            "targeting": {
                "country_code": localized.target_market.value,
                "location_targets": _location_targets(localized),
                "excluded_location_targets": _excluded_locations(localized),
                "schedule_windows": (localized.platform_metadata or {}).get(
                    "allowed_time_windows"
                ),
                "min_age_gate": sub_market.min_age if sub_market else None,
                "language_code": sub_market.content_language if sub_market else None,
            },
            "compliance_snapshot": {
                "report_id": str(localized.compliance_report_id)
                if localized.compliance_report_id
                else None,
                "confirmation_id": str(localized.confirmation_id)
                if localized.confirmation_id
                else None,
            },
        }
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("metadata.json", json.dumps(meta, ensure_ascii=False, indent=2))
            zf.writestr(f"asset/{original_filename}", asset_bytes)
        return ExportArtifact(
            filename=f"google_ads_{localized.id}.zip",
            bytes=buf.getvalue(),
            content_type="application/zip",
            metadata=meta,
        )


def _location_targets(asset: LocalizedAsset) -> list[str]:
    allowed = (asset.platform_metadata or {}).get("allowed_sub_regions") or []
    # US / NG state codes need full geo-target IDs in prod; here we emit the
    # ISO sub-market codes for the agency ops to map in Google's tool.
    return allowed or [asset.target_sub_market or asset.target_market.value]


def _excluded_locations(asset: LocalizedAsset) -> list[str]:
    return (asset.platform_metadata or {}).get("blocked_sub_regions") or []
