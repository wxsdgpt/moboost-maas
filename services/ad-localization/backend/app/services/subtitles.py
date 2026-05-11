"""SRT subtitle generation.

V1 uses this for the add_subtitles_only / keep_with_subtitles audio strategies.
It takes a list of (start, end, text) tuples and emits a SubRip string.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class SubtitleCue:
    start: float  # seconds
    end: float
    text: str


def to_srt(cues: list[SubtitleCue]) -> str:
    def fmt(t: float) -> str:
        t = max(0.0, t)
        h = int(t // 3600)
        m = int((t % 3600) // 60)
        s = int(t % 60)
        ms = int((t - int(t)) * 1000)
        return f"{h:02}:{m:02}:{s:02},{ms:03}"

    out: list[str] = []
    for i, cue in enumerate(cues, start=1):
        out.append(str(i))
        out.append(f"{fmt(cue.start)} --> {fmt(cue.end)}")
        out.append(cue.text.strip())
        out.append("")
    return "\n".join(out)
