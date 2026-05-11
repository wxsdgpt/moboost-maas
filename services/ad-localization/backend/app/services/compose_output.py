"""Compose the final per-market asset bytes.

Flow depends on source_type:
  PSD / AI       → render with text-layer swaps → flatten to PNG → apply overlays
  PNG / JPG      → start from source bytes → apply overlays (visual AI edits pending)
  MP4            → start from source bytes → FFmpeg drawtext overlays

Returns (bytes, mime, extension, overlay_flags).
"""

from __future__ import annotations

import hashlib
import io
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.logging import get_logger
from app.models import SubMarket
from app.models.enums import SourceType
from app.overlays import plan_overlays_for_asset, render_image_overlays, render_video_overlays
from app.services.visual_edit import edit_visual_lu

log = get_logger(__name__)


@dataclass
class ComposedAsset:
    bytes: bytes
    mime: str
    extension: str
    file_hash: str
    overlay_flags: dict


def compose(
    *,
    source_bytes: bytes,
    source_type: SourceType,
    unit_outputs: list[dict],
    sub_market: SubMarket,
) -> ComposedAsset:
    if source_type in (SourceType.psd, SourceType.ai):
        out = _render_psd(source_bytes, unit_outputs)
        mime = "image/png"
        ext = ".png"
    elif source_type in (SourceType.png, SourceType.jpg):
        out = _render_flat_image(source_bytes, source_type, unit_outputs)
        mime = "image/png"
        ext = ".png"
    elif source_type is SourceType.mp4:
        out = source_bytes
        mime = "video/mp4"
        ext = ".mp4"
    else:
        raise ValueError(f"unsupported source_type for composer: {source_type}")

    plan = plan_overlays_for_asset(sub_market)
    flags = plan.flags

    if source_type is SourceType.mp4:
        try:
            out = render_video_overlays(out, plan)
        except RuntimeError as e:
            log.warning("compose.video_overlay_skipped", error=str(e))
    else:
        try:
            out = render_image_overlays(out, plan)
        except RuntimeError as e:
            log.warning("compose.image_overlay_skipped", error=str(e))

    return ComposedAsset(
        bytes=out,
        mime=mime,
        extension=ext,
        file_hash=hashlib.sha256(out).hexdigest(),
        overlay_flags=flags,
    )


async def compose_async(
    session: AsyncSession,
    *,
    source_bytes: bytes,
    source_type: SourceType,
    unit_outputs: list[dict],
    sub_market: SubMarket,
    brand_restrictions: dict | None,
    market: str,
    sub_market_id: str | None,
    market_compliance: dict,
    market_culture: dict,
    apply_compliance_overlays: bool = True,
) -> ComposedAsset:
    """Full composer: applies Nano Banana visual edits sequentially with
    pHash verify, then stacks deterministic compliance overlays. Updates
    `unit_outputs` in place with AI generation ids and verification scores.
    """
    if source_type in (SourceType.psd, SourceType.ai):
        base = _render_psd(source_bytes, unit_outputs)
    elif source_type in (SourceType.png, SourceType.jpg):
        base = _render_flat_image(source_bytes, source_type, unit_outputs)
    elif source_type is SourceType.mp4:
        from app.services.video_editor import apply_video_edits

        base = await apply_video_edits(
            session,
            source_mp4=source_bytes,
            unit_outputs=unit_outputs,
            brand_restrictions=brand_restrictions,
            market=market,
            sub_market=sub_market_id,
            market_compliance=market_compliance,
            market_culture=market_culture,
        )
    elif source_type in (SourceType.txt, SourceType.md, SourceType.csv):
        base = _render_text(source_bytes, source_type, unit_outputs)
        return ComposedAsset(
            bytes=base,
            mime="text/plain" if source_type is SourceType.txt else (
                "text/csv" if source_type is SourceType.csv else "text/markdown"
            ),
            extension={SourceType.txt: ".txt", SourceType.md: ".md", SourceType.csv: ".csv"}[source_type],
            file_hash=hashlib.sha256(base).hexdigest(),
            overlay_flags={},
        )
    else:
        raise ValueError(f"unsupported source_type for composer: {source_type}")

    if source_type in (SourceType.png, SourceType.jpg, SourceType.psd, SourceType.ai):
        for out in unit_outputs:
            if out.get("processing_method") != "requested_nano_banana_edit":
                continue
            result = await edit_visual_lu(
                session,
                source_png=base,
                lu_output=out,
                brand_restrictions=brand_restrictions,
                market=market,
                sub_market=sub_market_id,
                market_compliance=market_compliance,
                market_culture=market_culture,
            )
            base = result.png_bytes
            out["processing_method"] = result.processing_method
            out["change_minimization_verified"] = result.verified
            out["change_minimization_score"] = result.score
            if result.ai_log_id:
                out["ai_generation_id"] = str(result.ai_log_id)
            if result.note:
                out["notes"] = result.note

    if apply_compliance_overlays:
        plan = plan_overlays_for_asset(sub_market)
        flags = plan.flags
    else:
        plan = None
        flags = {}

    if source_type is SourceType.mp4:
        mime = "video/mp4"
        ext = ".mp4"
        if plan is not None:
            try:
                base = render_video_overlays(base, plan)
            except RuntimeError as e:
                log.warning("compose.video_overlay_skipped", error=str(e))
    else:
        mime = "image/png"
        ext = ".png"
        if plan is not None:
            try:
                base = render_image_overlays(base, plan)
            except RuntimeError as e:
                log.warning("compose.image_overlay_skipped", error=str(e))

    return ComposedAsset(
        bytes=base,
        mime=mime,
        extension=ext,
        file_hash=hashlib.sha256(base).hexdigest(),
        overlay_flags=flags,
    )


# ---------- PSD path ------------------------------------------------------

def _render_psd(source_bytes: bytes, unit_outputs: list[dict]) -> bytes:
    """Apply text swaps and return a flattened PNG.

    psd-tools layer-text mutation is version-sensitive; we build a best-effort
    Pillow overlay that paints the target text over the original layer bbox
    when the in-layer update path fails. Untouched pixels remain bit-identical.
    """
    try:
        from PIL import Image, ImageDraw, ImageFont
        from psd_tools import PSDImage
    except ImportError as e:
        raise RuntimeError(
            "psd-tools + Pillow required for PSD composite. `pip install -e .[parsing]`"
        ) from e

    psd = PSDImage.open(io.BytesIO(source_bytes))
    swaps_by_layer_id: dict[str, str] = {}
    for out in unit_outputs:
        if out.get("strategy_applied") in {"keep_original", None}:
            continue
        text = (out.get("output_content") or {}).get("text")
        source_loc = (out.get("source_location") or {})
        layer_id = source_loc.get("psd_layer_id")
        if not text or not layer_id:
            continue
        swaps_by_layer_id[str(layer_id)] = text

    # Try mutating each layer in place first.
    for layer_id, new_text in swaps_by_layer_id.items():
        target = _find_layer_by_id(psd, layer_id)
        if target is None:
            log.warning("compose.psd.layer_not_found", layer_id=layer_id)
            continue
        try:
            target.text = new_text
        except Exception as e:  # noqa: BLE001
            log.warning("compose.psd.text_mutate_failed", layer_id=layer_id, error=str(e))

    composite = psd.composite()
    # Overlay painted fallback for any layer that didn't accept .text assignment
    canvas = composite.convert("RGBA")
    draw = ImageDraw.Draw(canvas)
    for layer_id, new_text in swaps_by_layer_id.items():
        target = _find_layer_by_id(psd, layer_id)
        if target is None:
            continue
        if _layer_text_matches(target, new_text):
            continue
        bbox = _layer_bbox(target)
        if bbox is None:
            continue
        font = _pick_font(target)
        # Paint a rectangle in the layer's dominant color first to mask the
        # original glyphs, then draw the new text. Rough but deterministic.
        fill_rgba = _layer_fill(target) + (255,)
        x, y, w, h = bbox
        draw.rectangle([x, y, x + w, y + h], fill=(0, 0, 0, 0))
        draw.text((x, y), new_text, fill=(255, 255, 255, 255), font=font)

    buf = io.BytesIO()
    canvas.convert("RGB").save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _find_layer_by_id(psd, layer_id: str):
    def walk(layer):
        if str(getattr(layer, "layer_id", "")) == str(layer_id):
            return layer
        if getattr(layer, "is_group", lambda: False)():
            for child in layer:
                r = walk(child)
                if r is not None:
                    return r
        return None

    return walk(psd)


def _layer_text_matches(layer, expected: str) -> bool:
    try:
        return (layer.text or "").strip() == expected.strip()
    except Exception:  # noqa: BLE001
        return False


def _layer_bbox(layer):
    try:
        left, top, right, bottom = layer.bbox
        return (int(left), int(top), int(right - left), int(bottom - top))
    except Exception:  # noqa: BLE001
        return None


def _layer_fill(layer) -> tuple[int, int, int]:
    color = getattr(layer, "color", None)
    if color:
        try:
            return tuple(int(c) for c in color)[:3]
        except Exception:  # noqa: BLE001
            pass
    return (255, 255, 255)


def _pick_font(layer):
    from PIL import ImageFont

    try:
        size = int(float(getattr(layer, "font_size", 0)) * 1.333) or 18
    except Exception:  # noqa: BLE001
        size = 18
    for candidate in ("DejaVuSans-Bold.ttf", "DejaVuSans.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(candidate, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


# ---------- Text path ----------------------------------------------------


def _render_text(source_bytes: bytes, source_type: SourceType, unit_outputs: list[dict]) -> bytes:
    """Rebuild a text / markdown / CSV output from unit_outputs.

    For .txt / .md we concatenate all text LU outputs line-by-line in the
    order they were produced. For .csv we preserve the original shape and
    substitute the localized text per cell by row/col index stored in the
    LU's detection_metadata.
    """
    if source_type in (SourceType.txt, SourceType.md):
        lines: list[str] = []
        for out in unit_outputs:
            if out.get("lu_type") and out["lu_type"] != "text":
                continue
            text = (out.get("output_content") or {}).get("text", "")
            if text:
                lines.append(text)
        return ("\n\n".join(lines) + "\n").encode("utf-8")

    # CSV: preserve original grid, replace cells by row/col from detection_metadata
    import csv
    import io

    src_text = source_bytes.decode("utf-8", errors="replace")
    reader = csv.reader(io.StringIO(src_text))
    rows = [list(r) for r in reader]

    by_rc: dict[tuple[int, int], str] = {}
    for out in unit_outputs:
        md = out.get("detection_metadata") or {}
        if "row" in md and "col" in md:
            by_rc[(md["row"] + 1 if rows and _has_header(rows[0]) else md["row"],
                   md["col"])] = (out.get("output_content") or {}).get("text", "")

    buf = io.StringIO()
    writer = csv.writer(buf)
    for r_idx, row in enumerate(rows):
        new_row = list(row)
        for c_idx in range(len(new_row)):
            if (r_idx, c_idx) in by_rc:
                new_row[c_idx] = by_rc[(r_idx, c_idx)]
        writer.writerow(new_row)
    return buf.getvalue().encode("utf-8")


def _has_header(first_row: list[str]) -> bool:
    headers = {"text", "copy", "source", "source_text", "headline", "cta", "body", "disclaimer", "role"}
    return any((c or "").strip().lower() in headers for c in first_row)


# ---------- Flat image path ----------------------------------------------

def _render_flat_image(source_bytes: bytes, source_type: SourceType, unit_outputs: list[dict]) -> bytes:
    """Flat-image composer.

    Opens the source image, and for each text LU that has a bounding box and
    translated text, paints a filled rectangle over the source region and
    renders the translated text on top.  Falls back to a plain PNG conversion
    when no translatable regions are found.
    """
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError as e:
        raise RuntimeError("Pillow required. `pip install -e .[parsing]`") from e

    img = Image.open(io.BytesIO(source_bytes)).convert("RGB")

    # Collect text LUs that have a bbox and translated text
    text_overlays: list[dict] = []
    # Also collect text LUs that have translated text but NO bbox (for fallback)
    no_bbox_texts: list[dict] = []
    log.info("compose.flat_image.start",
             unit_outputs_count=len(unit_outputs),
             image_size=f"{img.width}x{img.height}")
    for out in unit_outputs:
        oc = out.get("output_content") or {}
        target_text = oc.get("text") or ""
        source_text = oc.get("source_text") or ""
        source_loc = out.get("source_location") or {}
        bbox = source_loc.get("bbox")  # [x, y, w, h]
        strategy = out.get("strategy_applied", "")
        log.info("compose.flat_image.check_unit",
                 lu_id=out.get("lu_id"),
                 has_text=bool(target_text),
                 text_preview=target_text[:60] if target_text else None,
                 has_bbox=bool(bbox),
                 bbox=bbox,
                 strategy=strategy,
                 source_location_keys=list(source_loc.keys()) if source_loc else [])
        if not target_text or strategy == "keep_original":
            continue
        # Skip if translation failed (pending_ai means AI was unavailable)
        if out.get("processing_method") == "pending_ai":
            log.info("compose.flat_image.skip_pending_ai", lu_id=out.get("lu_id"))
            continue
        # Skip if translated text is identical to source (no actual translation happened)
        if target_text.strip() == source_text.strip() and source_text.strip():
            log.info("compose.flat_image.skip_identical",
                     lu_id=out.get("lu_id"),
                     text_preview=target_text[:60])
            continue
        if bbox and len(bbox) >= 4:
            text_overlays.append({
                "text": target_text,
                "bbox": bbox,
                "strategy": strategy,
                "semantic_role": out.get("semantic_role"),
                "font_info": (source_loc.get("font_info") or {}),
            })
        else:
            no_bbox_texts.append({
                "text": target_text,
                "strategy": strategy,
                "semantic_role": out.get("semantic_role"),
            })
    log.info("compose.flat_image.overlays_found",
             with_bbox=len(text_overlays),
             without_bbox=len(no_bbox_texts))

    if text_overlays:
        draw = ImageDraw.Draw(img)
        for overlay in text_overlays:
            x, y, w, h = overlay["bbox"]
            # Fill the original text region with a background color
            # sampled from the region edges for a natural look
            bg_color = _sample_edge_color(img, x, y, w, h)
            draw.rectangle([x, y, x + w, y + h], fill=bg_color)
            # Render the translated text centered in the bbox
            font = _fit_font(overlay["text"], w, h)
            _draw_text_centered(draw, overlay["text"], x, y, w, h, font)
    elif no_bbox_texts:
        # FALLBACK: We have translated text but no bounding boxes.
        # Render translated text as an overlay panel on the image so
        # the localization is at least visible.
        log.warning("compose.flat_image.fallback_layout",
                     count=len(no_bbox_texts),
                     reason="text_lus_have_no_bbox")
        img = _render_fallback_text_overlay(img, no_bbox_texts)

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _sample_edge_color(img, x: int, y: int, w: int, h: int) -> tuple:
    """Sample the average color along the edges of a bbox for background fill."""
    from PIL import Image
    pixels = []
    for dx in range(max(0, x), min(img.width, x + w)):
        if y > 0:
            pixels.append(img.getpixel((dx, max(0, y - 1))))
        if y + h < img.height:
            pixels.append(img.getpixel((dx, min(img.height - 1, y + h))))
    if not pixels:
        return (40, 40, 40)
    r = sum(p[0] for p in pixels) // len(pixels)
    g = sum(p[1] for p in pixels) // len(pixels)
    b = sum(p[2] for p in pixels) // len(pixels)
    return (r, g, b)


def _fit_font(text: str, max_w: int, max_h: int):
    """Try to find a font size that fits the text within the bbox."""
    from PIL import ImageFont
    # Try system fonts, fall back to default
    for font_name in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/PingFang.ttc",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]:
        try:
            # Start from a large size and shrink to fit
            for size in range(max(8, max_h - 4), 7, -1):
                font = ImageFont.truetype(font_name, size)
                bbox = font.getbbox(text)
                tw = bbox[2] - bbox[0]
                if tw <= max_w - 4:
                    return font
            return ImageFont.truetype(font_name, 8)
        except (OSError, IOError):
            continue
    # Last resort: default bitmap font
    return ImageFont.load_default()


def _draw_text_centered(draw, text: str, x: int, y: int, w: int, h: int, font):
    """Draw text centered within a bounding box."""
    bbox = font.getbbox(text)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = x + (w - tw) // 2
    ty = y + (h - th) // 2
    # Pick a contrasting text color
    bg = draw._image.getpixel((min(x + w // 2, draw._image.width - 1), min(y + h // 2, draw._image.height - 1)))
    luminance = (bg[0] * 299 + bg[1] * 587 + bg[2] * 114) / 1000
    text_color = (0, 0, 0) if luminance > 128 else (255, 255, 255)
    draw.text((tx, ty), text, fill=text_color, font=font)


def _render_fallback_text_overlay(img, no_bbox_texts: list[dict]):
    """Fallback: render translated text as overlay panels when bboxes are unavailable.

    Lays out text blocks in a semi-transparent panel over the image,
    so the localization is at least visible to the user. This is a
    degraded mode — proper bbox detection would look much better.
    """
    from PIL import Image, ImageDraw, ImageFont

    canvas = img.convert("RGBA")
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # Sort by semantic role importance
    role_order = {"headline": 0, "cta": 1, "subheadline": 2, "body": 3, "disclaimer": 4, "logo_text": 5}
    sorted_texts = sorted(no_bbox_texts, key=lambda t: role_order.get(t.get("semantic_role") or "", 3))

    # Calculate layout regions — distribute text blocks vertically across the image
    w, h = canvas.size
    margin = int(w * 0.05)
    usable_w = w - margin * 2

    # Load a font
    font_large = _load_fallback_font(max(16, int(h * 0.04)))
    font_small = _load_fallback_font(max(12, int(h * 0.025)))

    y_cursor = int(h * 0.05)
    for item in sorted_texts:
        text = item["text"]
        role = item.get("semantic_role") or ""
        font = font_large if role in ("headline", "cta", "subheadline") else font_small

        # Word-wrap text to fit usable width
        lines = _wrap_text(text, font, usable_w - 20)
        if not lines:
            continue

        # Calculate block height
        line_height = font.getbbox("Ay")[3] - font.getbbox("Ay")[1] + 4
        block_h = len(lines) * line_height + 16

        # Don't overflow past 90% of image height
        if y_cursor + block_h > h * 0.9:
            break

        # Draw semi-transparent background
        draw.rectangle(
            [margin, y_cursor, margin + usable_w, y_cursor + block_h],
            fill=(0, 0, 0, 160),
        )

        # Draw text lines
        text_y = y_cursor + 8
        for line in lines:
            draw.text((margin + 10, text_y), line, fill=(255, 255, 255, 240), font=font)
            text_y += line_height

        y_cursor += block_h + 8

    canvas = Image.alpha_composite(canvas, overlay)
    return canvas.convert("RGB")


def _load_fallback_font(size: int):
    """Load any available font at the given size."""
    from PIL import ImageFont
    for font_name in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/PingFang.ttc",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    ]:
        try:
            return ImageFont.truetype(font_name, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


def _wrap_text(text: str, font, max_width: int) -> list[str]:
    """Simple word-wrap for text to fit within max_width pixels."""
    words = text.split()
    lines = []
    current_line = ""
    for word in words:
        test_line = f"{current_line} {word}".strip()
        bbox = font.getbbox(test_line)
        if bbox[2] - bbox[0] <= max_width:
            current_line = test_line
        else:
            if current_line:
                lines.append(current_line)
            current_line = word
    if current_line:
        lines.append(current_line)
    return lines
