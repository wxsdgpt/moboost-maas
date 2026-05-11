"""Video parser — ffmpeg frame-sample + Whisper transcription.

The real pipeline:
1. ffprobe → duration / fps / aspect / audio channels
2. ffmpeg frame sampling at scene boundaries → multimodal LLM for overlay text
3. Audio extraction + Whisper transcription → dialogue Audio LUs

V1 scaffold returns ffprobe-backed structural metadata and delegates the heavy
path to Phase 3 integrations.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from app.parsers.base import ParsedResult, ParserError


def _ffprobe_available() -> bool:
    return shutil.which("ffprobe") is not None


def parse_video(data: bytes) -> ParsedResult:
    start = time.monotonic()
    warnings: list[str] = []

    if not _ffprobe_available():
        warnings.append(
            "ffprobe not found on PATH — structural metadata omitted. "
            "Install FFmpeg to enable video parsing."
        )
        structural: dict = {}
    else:
        structural = _ffprobe_to_metadata(data, warnings)

    warnings.append(
        "video LU extraction (overlay text, dialogue transcription, scene "
        "boundaries) is provided by Phase 3 AI integrations."
    )

    duration_ms = int((time.monotonic() - start) * 1000)
    return ParsedResult(
        parse_method="video_analyzer",
        parse_model_used="ffprobe+whisper (pending)",
        parse_confidence=None,
        parse_warnings=warnings,
        structural_metadata=structural,
        lus=[],
        parse_duration_ms=duration_ms,
    )


def _ffprobe_to_metadata(data: bytes, warnings: list[str]) -> dict:
    try:
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            tmp.write(data)
            path = Path(tmp.name)
        try:
            out = subprocess.run(
                [
                    "ffprobe",
                    "-v",
                    "error",
                    "-print_format",
                    "json",
                    "-show_streams",
                    "-show_format",
                    str(path),
                ],
                capture_output=True,
                text=True,
                timeout=30,
                check=False,
            )
        finally:
            path.unlink(missing_ok=True)
    except subprocess.TimeoutExpired:
        warnings.append("ffprobe timed out — skipping metadata")
        return {}
    except Exception as e:  # noqa: BLE001
        raise ParserError(f"ffprobe failed: {e}") from e

    if out.returncode != 0:
        warnings.append(f"ffprobe returned {out.returncode}: {out.stderr.strip()[:200]}")
        return {}

    try:
        probe = json.loads(out.stdout)
    except json.JSONDecodeError as e:
        warnings.append(f"ffprobe output not JSON: {e}")
        return {}

    video_stream = next(
        (s for s in probe.get("streams", []) if s.get("codec_type") == "video"), None
    )
    audio_streams = [s for s in probe.get("streams", []) if s.get("codec_type") == "audio"]
    fmt = probe.get("format", {})

    dims: dict = {}
    frame_rate: float | None = None
    if video_stream:
        dims = {
            "width": video_stream.get("width"),
            "height": video_stream.get("height"),
        }
        rate_raw = video_stream.get("avg_frame_rate") or video_stream.get("r_frame_rate")
        frame_rate = _parse_rate(rate_raw)
        dims["duration_seconds"] = _parse_float(fmt.get("duration"))

    return {
        "dimensions": dims,
        "frame_rate": frame_rate,
        "audio_channels": sum(s.get("channels", 0) for s in audio_streams),
        "bit_rate_kbps": int(int(fmt.get("bit_rate", 0)) / 1000) if fmt.get("bit_rate") else None,
        "container": fmt.get("format_name"),
    }


def _parse_rate(rate: str | None) -> float | None:
    if not rate or rate == "0/0":
        return None
    try:
        if "/" in rate:
            num, den = rate.split("/")
            d = float(den)
            return float(num) / d if d else None
        return float(rate)
    except ValueError:
        return None


def _parse_float(x) -> float | None:
    try:
        return float(x) if x is not None else None
    except ValueError:
        return None
