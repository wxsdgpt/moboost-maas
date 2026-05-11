from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from app.models import LocalizedAsset, SourceAsset, SubMarket


class ExportError(RuntimeError):
    pass


@dataclass
class ExportArtifact:
    filename: str
    bytes: bytes
    content_type: str
    metadata: dict = field(default_factory=dict)


class Exporter(Protocol):
    platform: str

    def export(
        self,
        *,
        localized: LocalizedAsset,
        source: SourceAsset,
        sub_market: SubMarket | None,
        asset_bytes: bytes,
        original_filename: str,
    ) -> ExportArtifact: ...
