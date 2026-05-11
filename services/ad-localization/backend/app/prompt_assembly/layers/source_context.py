from __future__ import annotations

import json

from app.prompt_assembly.base import BaseLayerImpl
from app.prompt_assembly.context import PromptContext
from app.prompt_assembly.trace import LayerContribution
from app.prompt_assembly.use_cases import UseCase


class SourceContextLayer(BaseLayerImpl):
    name = "SourceContextLayer"
    version = "1"
    priority = 80
    applies_to = tuple(UseCase)

    def apply(self, context: PromptContext) -> LayerContribution:
        user_bits: list[str] = []
        refs: list[dict] = []

        if context.source_content:
            user_bits.append("Source content:\n" + json.dumps(context.source_content, ensure_ascii=False))
        if context.source_location:
            user_bits.append("Source location: " + json.dumps(context.source_location, ensure_ascii=False))

        for ref in context.reference_assets:
            refs.append(
                {
                    "kind": ref.kind,
                    "storage_key": ref.storage_key,
                    "mime_type": ref.mime_type,
                    "metadata": ref.metadata,
                }
            )

        return LayerContribution(
            user_additions=user_bits,
            reference_assets=refs,
            metadata={
                "source_asset_id": str(context.source_asset_id) if context.source_asset_id else None,
                "source_asset_hash": context.source_asset_hash,
                "source_lu_id": str(context.source_lu_id) if context.source_lu_id else None,
            },
        )
