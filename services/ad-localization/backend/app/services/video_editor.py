"""Per-frame video text replacement.

Algorithm:
  1. Probe the source video for fps + frame count.
  2. For each text LU with a `time_range` and visible overlay, extract the
     affected frame range via ffmpeg.
  3. Run Nano Banana per frame with the same mask (from bbox) and the localized
     target text.
  4. Verify per-frame Change Minimization (pHash outside mask).
  5. Re-encode the video preserving original audio + fps + codec.

Degrades gracefully: if ffmpeg / psd-tools are absent, returns source bytes so
the outer composer can still apply deterministic overlays.
"""

from __future__ import annotations

import io
import shutil
import subprocess
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import AIError, get_image_adapter
from app.logging import get_logger
from app.models import AIGenerationLog
from app.models.enums import AIModel, AIStatus
from app.prompt_assembly import PromptContext, UseCase, assemble
from app.services.change_min import DEFAULT_THRESHOLD, verify_image_minimization
from app.services.visual_edit import _build_mask

log = get_logger(__name__)


@dataclass
class VideoProbe:
    fps: float
    duration: float
    width: int
    height: int


async def apply_video_edits(
    session: AsyncSession,
    *,
    source_mp4: bytes,
    unit_outputs: list[dict],
    brand_restrictions: dict | None,
    market: str,
    sub_market: str | None,
    market_compliance: dict,
    market_culture: dict,
) -> bytes:
    if shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None:
        log.warning("video_editor.skipped", reason="ffmpeg not on PATH")
        return source_mp4

    text_edits = [
        out
        for out in unit_outputs
        if out.get("strategy_applied") in {"literal_translate", "light_localize", "transcreate", "user_provided"}
        and (out.get("source_location") or {}).get("type") == "video_region"
        and (out.get("source_location") or {}).get("bbox")
        and (out.get("source_location") or {}).get("time_range")
    ]
    if not text_edits:
        return source_mp4

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        src_path = tmp_path / "in.mp4"
        src_path.write_bytes(source_mp4)
        probe = _probe(src_path)
        if probe is None:
            log.warning("video_editor.probe_failed")
            return source_mp4

        frames_dir = tmp_path / "frames"
        frames_dir.mkdir()
        audio_path = tmp_path / "audio.m4a"

        if _extract_frames(src_path, frames_dir, probe.fps) != 0:
            return source_mp4
        _extract_audio(src_path, audio_path)

        ok_edits = 0
        for edit in text_edits:
            if await _apply_edit_to_frames(
                session,
                edit=edit,
                frames_dir=frames_dir,
                probe=probe,
                brand_restrictions=brand_restrictions,
                market=market,
                sub_market=sub_market,
                market_compliance=market_compliance,
                market_culture=market_culture,
            ):
                ok_edits += 1

        log.info("video_editor.edits_applied", count=ok_edits, total=len(text_edits))

        out_path = tmp_path / "out.mp4"
        if _reassemble(frames_dir, audio_path, out_path, probe.fps) != 0:
            log.warning("video_editor.reassemble_failed")
            return source_mp4

        return out_path.read_bytes()


# ---------- ffmpeg helpers -----------------------------------------------

def _probe(path: Path) -> VideoProbe | None:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=r_frame_rate,width,height",
            "-show_entries",
            "format=duration",
            "-of",
            "json",
            str(path),
        ],
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    if result.returncode != 0:
        return None
    import json

    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        return None
    streams = data.get("streams") or []
    if not streams:
        return None
    stream = streams[0]
    rate = stream.get("r_frame_rate") or "0/0"
    try:
        num, den = rate.split("/")
        fps = float(num) / float(den) if float(den) else 0.0
    except ValueError:
        fps = 0.0
    return VideoProbe(
        fps=fps,
        duration=float((data.get("format") or {}).get("duration", 0) or 0),
        width=int(stream.get("width") or 0),
        height=int(stream.get("height") or 0),
    )


def _extract_frames(src: Path, frames_dir: Path, fps: float) -> int:
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(src),
        "-vf",
        f"fps={fps:.6f}",
        str(frames_dir / "f%06d.png"),
    ]
    return subprocess.run(cmd, capture_output=True, timeout=1800, check=False).returncode


def _extract_audio(src: Path, audio_path: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(src), "-vn", "-acodec", "copy", str(audio_path)],
        capture_output=True,
        timeout=300,
        check=False,
    )


def _reassemble(frames_dir: Path, audio_path: Path, out_path: Path, fps: float) -> int:
    args = [
        "ffmpeg",
        "-y",
        "-framerate",
        f"{fps:.6f}",
        "-i",
        str(frames_dir / "f%06d.png"),
    ]
    if audio_path.exists() and audio_path.stat().st_size > 0:
        args += ["-i", str(audio_path), "-c:a", "copy", "-map", "0:v:0", "-map", "1:a:0?"]
    args += ["-c:v", "libx264", "-pix_fmt", "yuv420p", str(out_path)]
    return subprocess.run(args, capture_output=True, timeout=1800, check=False).returncode


# ---------- per-frame edit ----------------------------------------------

async def _apply_edit_to_frames(
    session: AsyncSession,
    *,
    edit: dict,
    frames_dir: Path,
    probe: VideoProbe,
    brand_restrictions: dict | None,
    market: str,
    sub_market: str | None,
    market_compliance: dict,
    market_culture: dict,
) -> bool:
    loc = edit.get("source_location") or {}
    bbox_val = loc.get("bbox")
    time_range = loc.get("time_range")
    if not bbox_val or not time_range:
        return False
    bbox = tuple(int(v) for v in bbox_val[:4])  # type: ignore[arg-type]
    start_s = float(time_range[0])
    end_s = float(time_range[1])
    start_frame = max(1, int(start_s * probe.fps))
    end_frame = max(start_frame, int(end_s * probe.fps))

    ctx = PromptContext(
        use_case=UseCase.VIDEO_TEXT_REPLACE,
        market=market,
        sub_market=sub_market,
        source_lu_id=uuid.UUID(edit["lu_id"]) if edit.get("lu_id") else None,
        source_content=edit.get("output_content") or {},
        source_location=loc,
        brand_restrictions=brand_restrictions,
        market_compliance=market_compliance,
        market_culture=market_culture,
        mask_region={"type": "bbox", "bbox": list(bbox)},
        font_info=loc.get("font_info"),
        strategy=edit.get("strategy_applied"),
    )
    prompt, trace = assemble(ctx)

    try:
        adapter = get_image_adapter()
    except Exception as e:  # noqa: BLE001
        log.warning("video_editor.no_image_adapter", error=str(e))
        return False

    total = 0
    ok = 0
    for frame_idx in range(start_frame, end_frame + 1):
        frame_path = frames_dir / f"f{frame_idx:06d}.png"
        if not frame_path.exists():
            continue
        total += 1
        try:
            src_bytes = frame_path.read_bytes()
            mask_bytes = _build_mask(src_bytes, bbox)
            out = await adapter.edit(prompt, source_image=src_bytes, mask_image=mask_bytes)
            verification = verify_image_minimization(src_bytes, out.image_bytes, bbox, threshold=DEFAULT_THRESHOLD)
            if verification.passed:
                frame_path.write_bytes(out.image_bytes)
                ok += 1
        except AIError as e:
            log.warning("video_editor.frame_edit_failed", frame=frame_idx, error=str(e))
            break  # stop hammering the adapter when credentials are missing

    session.add(
        AIGenerationLog(
            lu_id=uuid.UUID(edit["lu_id"]) if edit.get("lu_id") else None,
            use_case=UseCase.VIDEO_TEXT_REPLACE.value,
            model=AIModel.nano_banana,
            provider_model_id="gemini-2.5-flash-image",
            assembly_trace=trace.to_dict(),
            input_hash=f"video:{edit.get('lu_id')}:{market}:{sub_market}:{start_frame}-{end_frame}",
            output_text=None,
            status=AIStatus.success if ok == total and total > 0 else AIStatus.failed,
            verification={
                "frames_total": total,
                "frames_edited": ok,
                "start_frame": start_frame,
                "end_frame": end_frame,
            },
            cache_hit=False,
        )
    )
    await session.flush()

    return ok == total and total > 0


def _iter_frames(frames_dir: Path) -> Iterator[Path]:
    return sorted(frames_dir.glob("f*.png"))  # type: ignore[return-value]
