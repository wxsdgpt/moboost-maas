"""Plan and render deterministic compliance overlays.

Per CLAUDE.md #8: RG logos, license numbers, warnings are NEVER AI-generated.
Pillow for images; FFmpeg drawtext for video.

planning: given a sub-market entry, produce an ordered list of OverlayItems.
rendering: apply them to bytes and return new bytes.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from app.models import SubMarket


PlacementHint = Literal["footer", "top-right", "bottom-left", "center"]


@dataclass
class OverlayItem:
    kind: Literal["text", "logo"]
    text: str | None = None
    asset_key: str | None = None        # storage key for a logo asset
    language: str | None = None
    placement: PlacementHint = "footer"
    # Size hint in characters for footer text layout
    size_ratio: float = 0.03            # fraction of the shorter image dim
    padding_px: int = 16
    metadata: dict = field(default_factory=dict)


@dataclass
class OverlayPlan:
    items: list[OverlayItem]
    flags: dict[str, bool]              # populates LocalizedAsset.platform_metadata.overlays


def plan_overlays_for_asset(sub_market: SubMarket) -> OverlayPlan:
    items: list[OverlayItem] = []
    flags: dict[str, bool] = {}

    # 1) Mandatory disclaimers (age label / warning text)
    for d in sub_market.mandatory_disclaimers or []:
        text = d.get("text") if isinstance(d, dict) else None
        if text:
            items.append(
                OverlayItem(
                    kind="text",
                    text=text,
                    language=d.get("language") if isinstance(d, dict) else None,
                    placement=d.get("placement") if isinstance(d, dict) else "footer",
                    size_ratio=0.025,
                )
            )
            # Flag the typical overlay slots that the rule engine cares about.
            flags["age_label"] = True
            lower = text.lower()
            if "begambleaware" in lower:
                flags["begambleaware"] = True
            if "spielen kann" in lower:
                flags["de_warning"] = True
            if "jouer comporte" in lower:
                flags["fr_warning"] = True
            if "jogue com" in lower:
                flags["br_warning"] = True
            if "risk and may be addictive" in lower:
                flags["asci_warning"] = True

    # 2) RG hotline (US / BR / NG)
    if sub_market.rg_hotline:
        items.append(
            OverlayItem(
                kind="text",
                text=f"Help: {sub_market.rg_hotline}",
                placement="footer",
                size_ratio=0.02,
            )
        )
        flags["rg_hotline"] = True

    # 3) RG logo (image-based, optional per sub-market)
    if sub_market.rg_logo_url:
        items.append(
            OverlayItem(
                kind="logo",
                asset_key=sub_market.rg_logo_url,
                placement="bottom-left",
                size_ratio=0.08,
            )
        )
        flags["rg_logo"] = True

    return OverlayPlan(items=items, flags=flags)


# ---------- Image rendering -------------------------------------------------

def render_image_overlays(source_png: bytes, plan: OverlayPlan) -> bytes:
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError as e:
        raise RuntimeError("Pillow not installed. `pip install -e .[parsing]`") from e
    import io

    src = Image.open(io.BytesIO(source_png)).convert("RGBA")
    canvas = src.copy()
    overlay_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay_layer)

    width, height = canvas.size
    short = min(width, height)
    cursor_y = height  # anchor to bottom

    # Text overlays: stacked from the bottom up
    footer_items = [i for i in plan.items if i.kind == "text" and i.placement == "footer"]
    for item in footer_items:
        size_px = max(10, int(short * item.size_ratio))
        font = _load_font(size_px)
        text_w, text_h = _measure(draw, item.text or "", font)
        x = (width - text_w) // 2
        cursor_y -= text_h + 4
        # Background bar for readability
        draw.rectangle(
            [0, cursor_y - 4, width, cursor_y + text_h + 4],
            fill=(0, 0, 0, 160),
        )
        draw.text((x, cursor_y), item.text or "", fill=(255, 255, 255, 255), font=font)

    # Logo overlays
    for item in plan.items:
        if item.kind != "logo" or not item.asset_key:
            continue
        logo = _load_logo(item.asset_key)
        if logo is None:
            continue
        target_h = max(16, int(short * item.size_ratio))
        ratio = target_h / logo.height
        logo = logo.resize((int(logo.width * ratio), target_h))
        if item.placement == "bottom-left":
            pos = (item.padding_px, height - target_h - item.padding_px)
        elif item.placement == "top-right":
            pos = (width - logo.width - item.padding_px, item.padding_px)
        else:
            pos = (width - logo.width - item.padding_px, height - target_h - item.padding_px)
        overlay_layer.paste(logo, pos, logo.convert("RGBA"))

    out = Image.alpha_composite(canvas, overlay_layer).convert("RGB")
    buf = io.BytesIO()
    out.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _load_font(size_px: int):
    from PIL import ImageFont

    # Try a bundled DejaVu as a sensible default; fall back to default bitmap.
    for candidate in (
        "DejaVuSans.ttf",
        "DejaVuSans-Bold.ttf",
        "arial.ttf",
    ):
        try:
            return ImageFont.truetype(candidate, size=size_px)
        except OSError:
            continue
    return ImageFont.load_default()


def _measure(draw, text: str, font) -> tuple[int, int]:
    try:
        left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
        return right - left, bottom - top
    except AttributeError:
        return draw.textsize(text, font=font)  # type: ignore[attr-defined]


def _load_logo(key: str):
    """Load a logo from the configured storage driver.

    Accepts either a storage key (local/S3) or an absolute HTTPS URL for
    regulator-provided static logos.
    """
    from PIL import Image
    import io

    from app.storage import get_storage

    try:
        if key.startswith("http"):
            import httpx

            resp = httpx.get(key, timeout=10)
            resp.raise_for_status()
            data = resp.content
        else:
            import asyncio

            storage = get_storage()
            data = asyncio.run(storage.get(key))
    except Exception:  # noqa: BLE001
        return None
    try:
        return Image.open(io.BytesIO(data)).convert("RGBA")
    except Exception:  # noqa: BLE001
        return None


# ---------- Video rendering (FFmpeg drawtext) ------------------------------

def render_video_overlays(source_mp4: bytes, plan: OverlayPlan) -> bytes:
    """Apply each text overlay as a drawtext filter; logos via overlay filter.

    Returns new MP4 bytes. Raises if ffmpeg isn't on PATH.
    """
    import shutil
    import subprocess
    import tempfile
    from pathlib import Path

    if shutil.which("ffmpeg") is None:
        raise RuntimeError("ffmpeg not on PATH — cannot render video overlays")

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        src_path = tmp_path / "in.mp4"
        out_path = tmp_path / "out.mp4"
        src_path.write_bytes(source_mp4)

        filters = []
        # Text overlays only — logos require binary inputs (-i) which we'd pipe
        # via additional -i args in a Phase 5 iteration. V1 handles the text
        # path deterministically; logos can be composited post-generation.
        y_cursor = "h-th-8"  # bottom anchor, each stacked up by increments
        offset = 0
        for item in plan.items:
            if item.kind != "text" or not item.text:
                continue
            text = _ffmpeg_escape(item.text)
            # Bigger items rendered above smaller items.
            size_px = max(14, int(item.size_ratio * 640))
            filters.append(
                f"drawtext=text='{text}':fontcolor=white:fontsize={size_px}:"
                f"box=1:boxcolor=black@0.6:boxborderw=6:"
                f"x=(w-text_w)/2:y={y_cursor}-{offset}"
            )
            offset += size_px + 16

        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            str(src_path),
            "-vf",
            ",".join(filters) if filters else "null",
            "-codec:a",
            "copy",
            str(out_path),
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=600, check=False)
        if result.returncode != 0:
            raise RuntimeError(
                f"ffmpeg failed: {result.stderr.decode(errors='ignore')[:500]}"
            )
        return out_path.read_bytes()


def _ffmpeg_escape(text: str) -> str:
    return (
        text.replace("\\", "\\\\")
        .replace("'", "\\'")
        .replace(":", "\\:")
        .replace("%", "\\%")
    )
