from __future__ import annotations

from app.exporters.base import Exporter
from app.exporters.dsp import DspExporter
from app.exporters.google import GoogleAdsExporter
from app.exporters.meta import MetaAdsExporter

_EXPORTERS: dict[str, Exporter] = {
    "meta_ads": MetaAdsExporter(),
    "google_ads": GoogleAdsExporter(),
    "dsp_generic": DspExporter(),
}


def get_exporter(platform: str) -> Exporter:
    try:
        return _EXPORTERS[platform]
    except KeyError as e:
        raise ValueError(f"unsupported export platform: {platform}") from e


def list_platforms() -> list[str]:
    return list(_EXPORTERS.keys())
