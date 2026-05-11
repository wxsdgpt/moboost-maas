from __future__ import annotations

import io
import json
import zipfile

from app.exporters.base import ExportArtifact, Exporter
from app.models import LocalizedAsset, SourceAsset, SubMarket


class DspExporter(Exporter):
    """Generic DSP-friendly MP4/PNG + open metadata. Usable by The Trade Desk,
    DV360, Xandr, and programmatic buyers that accept open specs.
    """

    platform = "dsp_generic"

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
            "spec_version": "1.0",
            "asset_id": str(localized.id),
            "market": localized.target_market.value,
            "sub_market": localized.target_sub_market,
            "language": sub_market.content_language if sub_market else None,
            "min_age_gate": sub_market.min_age if sub_market else None,
            "platform_policy": {
                "schedule_windows_local": (localized.platform_metadata or {}).get(
                    "allowed_time_windows"
                ),
                "geo_include": (localized.platform_metadata or {}).get(
                    "allowed_sub_regions"
                ),
                "geo_exclude": (localized.platform_metadata or {}).get(
                    "blocked_sub_regions"
                ),
                "channels_include": (localized.platform_metadata or {}).get(
                    "allowed_platforms"
                ),
            },
            "source": {
                "source_asset_id": str(localized.source_asset_id),
                "source_hash": source.source_file_hash,
                "output_hash": localized.output_file_hash,
            },
            "audit": {
                "compliance_report_id": str(localized.compliance_report_id)
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
            filename=f"dsp_{localized.id}.zip",
            bytes=buf.getvalue(),
            content_type="application/zip",
            metadata=meta,
        )
