from __future__ import annotations

import hashlib
import uuid
from pathlib import PurePosixPath

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SourceAsset
from app.models.enums import ParseStatus, SourceType
from app.storage import get_storage

EXT_TO_TYPE: dict[str, SourceType] = {
    ".psd": SourceType.psd,
    ".ai": SourceType.ai,
    ".png": SourceType.png,
    ".jpg": SourceType.jpg,
    ".jpeg": SourceType.jpg,
    ".mp4": SourceType.mp4,
    ".txt": SourceType.txt,
    ".csv": SourceType.csv,
    ".md": SourceType.md,
    ".markdown": SourceType.md,
}

# PSD/AI carry editable layers — the system prefers the deterministic layer-swap path.
EDITABLE = {SourceType.psd, SourceType.ai}


def infer_source_type(filename: str) -> SourceType:
    ext = PurePosixPath(filename.lower()).suffix
    try:
        return EXT_TO_TYPE[ext]
    except KeyError as e:
        raise ValueError(f"unsupported file type: {ext}") from e


def build_storage_key(
    brand_id: uuid.UUID, project_id: uuid.UUID, asset_id: uuid.UUID, ext: str
) -> str:
    return f"source/{brand_id}/{project_id}/{asset_id}{ext}"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


async def create_source_asset(
    session: AsyncSession,
    *,
    brand_id: uuid.UUID,
    project_id: uuid.UUID,
    uploaded_by: uuid.UUID | None,
    original_filename: str,
    data: bytes,
    tags: list[str] | None = None,
) -> SourceAsset:
    source_type = infer_source_type(original_filename)
    asset_id = uuid.uuid4()
    ext = PurePosixPath(original_filename.lower()).suffix or ""
    key = build_storage_key(brand_id, project_id, asset_id, ext)

    storage = get_storage()
    await storage.put(key, data, content_type=_mime_for(source_type))

    asset = SourceAsset(
        id=asset_id,
        project_id=project_id,
        brand_id=brand_id,
        uploaded_by=uploaded_by,
        source_type=source_type,
        original_filename=original_filename,
        storage_key=key,
        source_file_hash=sha256(data),
        size_bytes=len(data),
        has_editable_layers=source_type in EDITABLE,
        file_metadata={},
        tags=tags or [],
        parse_status=ParseStatus.pending,
    )
    session.add(asset)
    await session.flush()
    return asset


def _mime_for(t: SourceType) -> str:
    return {
        SourceType.psd: "image/vnd.adobe.photoshop",
        SourceType.ai: "application/postscript",
        SourceType.png: "image/png",
        SourceType.jpg: "image/jpeg",
        SourceType.mp4: "video/mp4",
        SourceType.txt: "text/plain",
        SourceType.csv: "text/csv",
        SourceType.md: "text/markdown",
    }[t]
