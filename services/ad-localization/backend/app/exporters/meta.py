from __future__ import annotations

import io
import json
import zipfile

from app.exporters.base import ExportArtifact, Exporter
from app.models import LocalizedAsset, SourceAsset, SubMarket


class MetaAdsExporter(Exporter):
    platform = "meta_ads"

    def export(
        self,
        *,
        localized: LocalizedAsset,
        source: SourceAsset,
        sub_market: SubMarket | None,
        asset_bytes: bytes,
        original_filename: str,
    ) -> ExportArtifact:
        metadata = {
            "platform": "meta_ads",
            "asset": {
                "id": str(localized.id),
                "source_asset_id": str(localized.source_asset_id),
                "source_hash": source.source_file_hash,
                "output_hash": localized.output_file_hash,
                "mime": _mime_for(source.source_type.value),
                "dimensions": (source.file_metadata or {}).get("dimensions"),
            },
            "targeting": {
                "market": localized.target_market.value,
                "sub_market": localized.target_sub_market,
                "allowed_time_windows": (localized.platform_metadata or {}).get(
                    "allowed_time_windows"
                ),
                "allowed_regions": (localized.platform_metadata or {}).get(
                    "allowed_regions"
                ),
                "allowed_sub_regions": (localized.platform_metadata or {}).get(
                    "allowed_sub_regions"
                ),
                "blocked_sub_regions": (localized.platform_metadata or {}).get(
                    "blocked_sub_regions"
                ),
                "min_age": sub_market.min_age if sub_market else None,
                "languages": [sub_market.content_language] if sub_market else [],
            },
            "copy": {
                "primary_text": _primary_text(localized),
                "headline": _headline(localized),
                "disclaimer_overlayed": bool(
                    (localized.platform_metadata or {}).get("overlays")
                ),
            },
            "compliance": {
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
            zf.writestr("metadata.json", json.dumps(metadata, ensure_ascii=False, indent=2))
            zf.writestr(f"asset/{original_filename}", asset_bytes)

        return ExportArtifact(
            filename=f"meta_ads_{localized.id}.zip",
            bytes=buf.getvalue(),
            content_type="application/zip",
            metadata=metadata,
        )


def _mime_for(source_type: str) -> str:
    return {
        "psd": "image/vnd.adobe.photoshop",
        "ai": "application/postscript",
        "png": "image/png",
        "jpg": "image/jpeg",
        "mp4": "video/mp4",
    }.get(source_type, "application/octet-stream")


def _primary_text(localized: LocalizedAsset) -> str | None:
    for out in localized.unit_outputs or []:
        if out.get("semantic_role") in {"body", "headline"} and isinstance(
            (out.get("output_content") or {}).get("text"), str
        ):
            return out["output_content"]["text"]
    return None


def _headline(localized: LocalizedAsset) -> str | None:
    for out in localized.unit_outputs or []:
        if out.get("semantic_role") == "headline" and isinstance(
            (out.get("output_content") or {}).get("text"), str
        ):
            return out["output_content"]["text"]
    return None
