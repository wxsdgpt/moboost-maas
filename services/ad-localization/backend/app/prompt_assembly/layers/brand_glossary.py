from __future__ import annotations

from app.prompt_assembly.base import BaseLayerImpl
from app.prompt_assembly.context import PromptContext
from app.prompt_assembly.trace import LayerContribution
from app.prompt_assembly.use_cases import UseCase


class BrandGlossaryLayer(BaseLayerImpl):
    name = "BrandGlossaryLayer"
    version = "1"
    priority = 40
    applies_to = (
        UseCase.TEXT_LITERAL_TRANSLATE,
        UseCase.TEXT_LIGHT_LOCALIZE,
        UseCase.TEXT_TRANSCREATE,
        UseCase.IMAGE_TEXT_REPLACE,
        UseCase.VIDEO_TEXT_REPLACE,
        UseCase.VIDEO_AUDIO_REPLACE,
    )

    def apply(self, context: PromptContext) -> LayerContribution:
        if context.use_case not in self.applies_to:
            return LayerContribution()
        entries = context.brand_glossary or []
        if not entries:
            return LayerContribution()
        lines: list[str] = []
        for e in entries:
            source = e.get("source_term")
            t = (e.get("translations") or {}).get(context.target_tag) or (
                e.get("translations") or {}
            ).get(context.market)
            if not source or not t:
                continue
            behavior = t.get("behavior")
            if behavior == "keep_original":
                lines.append(f"'{source}' must be kept untranslated.")
            elif behavior == "use_translation" and t.get("translated_term"):
                lines.append(f"'{source}' → '{t['translated_term']}' (required).")
            elif behavior == "use_alternate":
                forms = t.get("alternate_forms") or []
                if forms:
                    lines.append(
                        f"'{source}' → one of: {', '.join(forms)}."
                    )
            locked = (e.get("locked_transcreations") or {}).get(context.target_tag)
            if locked:
                lines.append(f"Always transcreate '{source}' as exactly: '{locked}'.")
        if not lines:
            return LayerContribution()
        return LayerContribution(
            system_additions=["Brand glossary enforced:"] + lines,
            metadata={"entries": len(lines)},
        )
