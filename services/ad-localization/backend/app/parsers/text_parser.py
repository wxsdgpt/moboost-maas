"""Text-file parser.

Handles .txt / .md (single LU carrying the whole body) and .csv (each non-empty
row becomes its own TextLU so the matrix can treat rows independently).
"""

from __future__ import annotations

import csv
import io
import time

from app.models.enums import LUType, SemanticRole, SourceType
from app.parsers.base import LUCandidate, ParsedResult, SourceLocation


def parse_text(data: bytes, source_type: SourceType) -> ParsedResult:
    start = time.monotonic()
    body = data.decode("utf-8", errors="replace")
    lus: list[LUCandidate] = []
    warnings: list[str] = []

    if source_type is SourceType.csv:
        reader = csv.reader(io.StringIO(body))
        rows = list(reader)
        header: list[str] | None = None
        data_rows = rows
        if rows and any(_looks_like_header(cell) for cell in rows[0]):
            header = rows[0]
            data_rows = rows[1:]

        for idx, row in enumerate(data_rows):
            for col, cell in enumerate(row):
                if not cell or not cell.strip():
                    continue
                field_name = header[col] if header and col < len(header) else f"col{col}"
                lus.append(
                    LUCandidate(
                        lu_type=LUType.text,
                        source_content={"text": cell.strip(), "language": "en"},
                        source_location=SourceLocation(
                            type="metadata",
                            field_name=f"row{idx}.{field_name}",
                        ),
                        semantic_role=_role_for(field_name),
                        parser_confidence=1.0,
                        detection_metadata={
                            "row": idx,
                            "col": col,
                            "field": field_name,
                        },
                    )
                )
    else:
        # .txt and .md: single LU carrying the whole body.
        text = body.strip()
        if text:
            lus.append(
                LUCandidate(
                    lu_type=LUType.text,
                    source_content={"text": text, "language": "en"},
                    source_location=SourceLocation(type="metadata", field_name="body"),
                    semantic_role=SemanticRole.body,
                    parser_confidence=1.0,
                )
            )
        else:
            warnings.append("empty text body")

    duration_ms = int((time.monotonic() - start) * 1000)
    return ParsedResult(
        parse_method="text_file",
        parse_model_used=None,
        parse_confidence=1.0,
        parse_warnings=warnings,
        structural_metadata={
            "char_count": len(body),
            "line_count": body.count("\n") + 1,
            "format": source_type.value,
        },
        lus=lus,
        parse_duration_ms=duration_ms,
    )


def _looks_like_header(cell: str) -> bool:
    cell = (cell or "").strip().lower()
    return cell in {
        "text",
        "copy",
        "source",
        "source_text",
        "headline",
        "cta",
        "body",
        "disclaimer",
        "role",
    }


def _role_for(field_name: str) -> SemanticRole | None:
    key = field_name.lower()
    if "cta" in key:
        return SemanticRole.cta
    if "headline" in key:
        return SemanticRole.headline
    if "legal" in key or "disclaim" in key:
        return SemanticRole.disclaimer
    if "tagline" in key or "slogan" in key:
        return SemanticRole.tagline
    if "brand" in key:
        return SemanticRole.brand_name
    return SemanticRole.body
