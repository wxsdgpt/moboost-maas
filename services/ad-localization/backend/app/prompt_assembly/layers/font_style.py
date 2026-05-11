from __future__ import annotations

from app.prompt_assembly.base import BaseLayerImpl
from app.prompt_assembly.context import PromptContext
from app.prompt_assembly.trace import LayerContribution
from app.prompt_assembly.use_cases import UseCase


class FontStyleLayer(BaseLayerImpl):
    name = "FontStyleLayer"
    version = "1"
    priority = 25
    applies_to = (UseCase.IMAGE_TEXT_REPLACE, UseCase.VIDEO_TEXT_REPLACE)

    def apply(self, context: PromptContext) -> LayerContribution:
        if context.use_case not in self.applies_to:
            return LayerContribution()
        f = context.font_info or {}
        s = context.style_info or {}
        parts: list[str] = []
        if f.get("font_postscript_name") or f.get("family"):
            parts.append(
                f"Preserve font family ({f.get('font_postscript_name') or f.get('family')})."
            )
        if f.get("size_pt"):
            parts.append(f"Match text size (~{f['size_pt']}pt).")
        if f.get("color"):
            parts.append(f"Match color {f['color']}.")
        if s.get("has_effects"):
            parts.append("Preserve text effects (shadow / stroke / glow).")
        parts.append("Match perspective and baseline of the original text.")
        return LayerContribution(
            positive_additions=parts,
            metadata={"has_font_info": bool(f)},
        )
