"""Pluggable object-storage abstraction.

Supports:
  - **local**  – plain filesystem (dev / single-server)
  - **s3**     – any S3-compatible store (prod)

Usage::

    from app.storage import get_storage
    storage = get_storage()
    await storage.put("source/abc/file.psd", data, content_type="image/vnd.adobe.photoshop")
    data = await storage.get("source/abc/file.psd")
"""
from __future__ import annotations

import abc
from functools import lru_cache
from pathlib import Path

from app.config import get_settings


class StorageBackend(abc.ABC):
    """Minimal async blob-store interface."""

    @abc.abstractmethod
    async def put(self, key: str, data: bytes, *, content_type: str = "application/octet-stream") -> None: ...

    @abc.abstractmethod
    async def get(self, key: str) -> bytes: ...

    @abc.abstractmethod
    async def delete(self, key: str) -> None: ...

    @abc.abstractmethod
    async def exists(self, key: str) -> bool: ...


class LocalStorage(StorageBackend):
    """Store blobs on the local filesystem."""

    def __init__(self, root: Path) -> None:
        self._root = root
        self._root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        return self._root / key

    async def put(self, key: str, data: bytes, *, content_type: str = "application/octet-stream") -> None:
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)

    async def get(self, key: str) -> bytes:
        p = self._path(key)
        if not p.exists():
            raise FileNotFoundError(f"storage key not found: {key}")
        return p.read_bytes()

    async def delete(self, key: str) -> None:
        p = self._path(key)
        if p.exists():
            p.unlink()

    async def exists(self, key: str) -> bool:
        return self._path(key).exists()


class S3Storage(StorageBackend):
    """Store blobs in S3 (or compatible). Lazy-imports boto3."""

    def __init__(self) -> None:
        import boto3  # noqa: F811
        settings = get_settings()
        kwargs: dict = {}
        if settings.s3_endpoint_url:
            kwargs["endpoint_url"] = settings.s3_endpoint_url
        if settings.s3_access_key and settings.s3_secret_key:
            kwargs["aws_access_key_id"] = settings.s3_access_key
            kwargs["aws_secret_access_key"] = settings.s3_secret_key
        if settings.s3_region:
            kwargs["region_name"] = settings.s3_region
        self._client = boto3.client("s3", **kwargs)
        self._bucket = settings.s3_bucket or "ad-localization"

    async def put(self, key: str, data: bytes, *, content_type: str = "application/octet-stream") -> None:
        self._client.put_object(Bucket=self._bucket, Key=key, Body=data, ContentType=content_type)

    async def get(self, key: str) -> bytes:
        resp = self._client.get_object(Bucket=self._bucket, Key=key)
        return resp["Body"].read()

    async def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket, Key=key)

    async def exists(self, key: str) -> bool:
        try:
            self._client.head_object(Bucket=self._bucket, Key=key)
            return True
        except self._client.exceptions.ClientError:
            return False


@lru_cache
def get_storage() -> StorageBackend:
    settings = get_settings()
    if settings.storage_driver == "s3":
        return S3Storage()
    return LocalStorage(settings.storage_local_root)
