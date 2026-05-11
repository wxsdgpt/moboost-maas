from __future__ import annotations

from app.models.enums import SourceType
from app.parsers.base import ParsedResult, ParserError
from app.parsers.image_parser import parse_flattened_image
from app.parsers.psd_parser import parse_psd
from app.parsers.text_parser import parse_text
from app.parsers.video_parser import parse_video


def parse_bytes(source_type: SourceType, data: bytes) -> ParsedResult:
    if source_type in (SourceType.psd, SourceType.ai):
        return parse_psd(data)
    if source_type in (SourceType.png, SourceType.jpg):
        return parse_flattened_image(data)
    if source_type is SourceType.mp4:
        return parse_video(data)
    if source_type in (SourceType.txt, SourceType.md, SourceType.csv):
        return parse_text(data, source_type)
    raise ParserError(f"no parser registered for {source_type}")
