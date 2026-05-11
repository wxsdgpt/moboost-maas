"""PSD parser backed by `psd-tools`.

Extracts:
- Text layers → Text LU candidates (preserving font/color when available)
- Bitmap layers → Visual LU candidates (with bbox, role heuristics)

This is the 'deterministic path' — the preferred route per CLAUDE.md.
"""

from __future__ import annotations

import io
import time
from typing import TYPE_CHECKING

from app.models.enums import LUType, SemanticRole
from app.parsers.base import (
    LUCandidate,
    ParsedResult,
    ParserError,
    SourceLocation,
)

if TYPE_CHECKING:  # avoid hard dependency at import time
    from psd_tools import PSDImage


def _lazy_psd_import():
    try:
        from psd_tools import PSDImage  # type: ignore
        from psd_tools.constants import Resource  # noqa: F401
    except ImportError as e:
        raise ParserError(
            "psd-tools is not installed. Run `pip install -e .[parsing]` in the backend."
        ) from e
    return PSDImage


def _guess_semantic_role(layer_name: str) -> SemanticRole | None:
    n = layer_name.lower()
    if any(k in n for k in ("cta", "button")):
        return SemanticRole.cta
    if any(k in n for k in ("legal", "t&c", "tc", "disclaimer", "18+", "21+")):
        return SemanticRole.disclaimer
    if any(k in n for k in ("odds", "line")):
        return SemanticRole.odds
    if "logo" in n:
        return SemanticRole.logo
    if any(k in n for k in ("headline", "title")):
        return SemanticRole.headline
    if any(k in n for k in ("tagline", "slogan")):
        return SemanticRole.tagline
    if any(k in n for k in ("brand",)):
        return SemanticRole.brand_name
    return None


def parse_psd(data: bytes) -> ParsedResult:
    PSDImage = _lazy_psd_import()
    start = time.monotonic()

    try:
        psd: PSDImage = PSDImage.open(io.BytesIO(data))
    except Exception as e:  # noqa: BLE001
        raise ParserError(f"failed to open PSD: {e}") from e

    lus: list[LUCandidate] = []
    warnings: list[str] = []

    # Walk all descendant layers (flatten groups)
    def _walk(layer) -> list:
        out = []
        if getattr(layer, "is_group", lambda: False)():
            for child in layer:
                out.extend(_walk(child))
        else:
            out.append(layer)
        return out

    all_layers = _walk(psd)

    for layer in all_layers:
        name = getattr(layer, "name", "") or ""
        bbox = _layer_bbox(layer)

        if getattr(layer, "kind", "") == "type" and hasattr(layer, "text"):
            text = (layer.text or "").strip()
            if not text:
                continue
            font_info = _extract_font(layer, warnings)
            style_info = _extract_style(layer)
            lus.append(
                LUCandidate(
                    lu_type=LUType.text,
                    source_content={
                        "text": text,
                        "language": "en",  # V1 assumes English source; overridden later
                        "font_info": font_info,
                        "style_info": style_info,
                    },
                    source_location=SourceLocation(
                        type="psd_layer",
                        psd_layer_id=_layer_id(layer),
                        bbox=bbox,
                        font_info=font_info,
                        style_info=style_info,
                    ),
                    semantic_role=_guess_semantic_role(name),
                    is_locked=False,
                    max_length_constraint=_estimate_max_length(bbox, font_info),
                    parser_confidence=0.99,  # deterministic path
                    detection_metadata={"layer_name": name},
                )
            )
            continue

        # Non-text raster layers → Visual LU candidates
        if bbox and all(v > 0 for v in (bbox[2], bbox[3])):
            lus.append(
                LUCandidate(
                    lu_type=LUType.visual,
                    source_content={
                        "description": name or "unnamed bitmap layer",
                        "element_type": "prop",
                        "detected_attributes": {},
                    },
                    source_location=SourceLocation(
                        type="psd_layer",
                        psd_layer_id=_layer_id(layer),
                        bbox=bbox,
                    ),
                    semantic_role=_guess_semantic_role(name),
                    is_locked=False,
                    parser_confidence=0.90,
                    detection_metadata={"layer_name": name},
                )
            )

    duration_ms = int((time.monotonic() - start) * 1000)

    return ParsedResult(
        parse_method="psd_tools",
        parse_model_used=None,
        parse_confidence=0.95,
        parse_warnings=warnings,
        structural_metadata={
            "dimensions": {"width": int(psd.width), "height": int(psd.height)},
            "layer_count": len(all_layers),
            "color_mode": str(getattr(psd, "color_mode", "")),
        },
        lus=lus,
        parse_duration_ms=duration_ms,
    )


def _layer_id(layer) -> str:
    # psd-tools doesn't always expose a stable id; fall back to name+bbox.
    lid = getattr(layer, "layer_id", None)
    return str(lid) if lid is not None else f"{getattr(layer, 'name', 'layer')}@{_layer_bbox(layer)}"


def _layer_bbox(layer) -> tuple[int, int, int, int] | None:
    try:
        l, t, r, b = layer.bbox
        return (int(l), int(t), int(r - l), int(b - t))
    except Exception:  # noqa: BLE001
        return None


def _extract_font(layer, warnings: list[str]) -> dict | None:
    try:
        engine = layer.engine_dict
    except Exception:  # noqa: BLE001
        return None
    try:
        style = layer.resource_dict
        return {
            "font_postscript_name": getattr(layer, "font", None),
            "size_pt": float(getattr(layer, "font_size", 0)) or None,
            "color": _rgba_or_none(getattr(layer, "color", None)),
            "engine_dict_keys": list(engine.keys()) if engine else [],
            "style_sheet_data": dict(style) if style else None,
        }
    except Exception as e:  # noqa: BLE001
        warnings.append(f"font extraction partial: {e}")
        return None


def _extract_style(layer) -> dict | None:
    effects = getattr(layer, "effects", None)
    if effects is None:
        return None
    try:
        return {"has_effects": bool(list(effects))}
    except Exception:  # noqa: BLE001
        return None


def _rgba_or_none(color) -> list[int] | None:
    try:
        return [int(c) for c in color][:4] if color else None
    except Exception:  # noqa: BLE001
        return None


def _estimate_max_length(bbox: tuple[int, int, int, int] | None, font_info: dict | None) -> int | None:
    """Very rough heuristic so the strategy layer knows CTA buttons can't grow."""
    if not bbox:
        return None
    width_px = bbox[2]
    size_pt = (font_info or {}).get("size_pt") or 14
    # ~0.55 avg glyph-advance per pt in English; add 20% headroom.
    advance_px = size_pt * 0.55 * 1.333  # pt → px @ 96dpi
    if advance_px <= 0:
        return None
    return max(4, int(width_px / advance_px * 1.2))
