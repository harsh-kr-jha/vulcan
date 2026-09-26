"""Tenant-safe blob storage for telemetry archives, datasets and artifacts."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from uuid import uuid4

import boto3
from botocore.exceptions import ClientError
from django.conf import settings


def safe_key(key: str) -> str:
    raw = str(key)
    path = PurePosixPath(raw)
    if not path.parts or path.is_absolute() or ".." in path.parts or raw.startswith("/"):
        raise ValueError("Storage key must be a safe relative path.")
    return path.as_posix()


class BlobStorage(ABC):
    @abstractmethod
    def put(self, key: str, data: bytes, *, content_type: str) -> str: ...

    @abstractmethod
    def get(self, key: str) -> bytes: ...

    @abstractmethod
    def delete(self, key: str) -> None: ...

    @abstractmethod
    def exists(self, key: str) -> bool: ...

    @abstractmethod
    def list(self, prefix: str = "") -> list[str]: ...


class FileSystemStorage(BlobStorage):
    def __init__(self, root: str | Path | None = None):
        self.root = Path(root or settings.TELEMETRY_STORAGE_ROOT).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = self.root.joinpath(*PurePosixPath(safe_key(key)).parts).resolve()
        if not path.is_relative_to(self.root):
            raise ValueError("Storage key escapes the configured root.")
        return path

    def put(self, key: str, data: bytes, *, content_type: str) -> str:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(f"{path.suffix}.{uuid4().hex}.tmp")
        temporary.write_bytes(data)
        temporary.chmod(settings.TELEMETRY_LOCAL_FILE_MODE)
        temporary.replace(path)
        return key

    def get(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()

    def list(self, prefix: str = "") -> list[str]:
        base = self._path(prefix) if prefix else self.root
        if not base.exists():
            return []
        paths = [base] if base.is_file() else base.rglob("*")
        return sorted(path.relative_to(self.root).as_posix() for path in paths if path.is_file())


class S3Storage(BlobStorage):
    def __init__(self):
        if not settings.TELEMETRY_STORAGE_BUCKET:
            raise ValueError("TELEMETRY_STORAGE_BUCKET is required for the s3 backend.")
        self.bucket = settings.TELEMETRY_STORAGE_BUCKET
        self.prefix = settings.TELEMETRY_STORAGE_PREFIX.strip("/")
        self.client = boto3.client(
            "s3",
            region_name=settings.AWS_REGION,
            endpoint_url=settings.TELEMETRY_STORAGE_ENDPOINT_URL,
        )

    def _key(self, key: str) -> str:
        relative = safe_key(key)
        return f"{self.prefix}/{relative}" if self.prefix else relative

    def put(self, key: str, data: bytes, *, content_type: str) -> str:
        arguments = {
            "Bucket": self.bucket,
            "Key": self._key(key),
            "Body": data,
            "ContentType": content_type,
        }
        if settings.TELEMETRY_STORAGE_SSE:
            arguments["ServerSideEncryption"] = settings.TELEMETRY_STORAGE_SSE
        if settings.TELEMETRY_STORAGE_KMS_KEY_ID:
            arguments["SSEKMSKeyId"] = settings.TELEMETRY_STORAGE_KMS_KEY_ID
        self.client.put_object(**arguments)
        return key

    def get(self, key: str) -> bytes:
        return self.client.get_object(Bucket=self.bucket, Key=self._key(key))["Body"].read()

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=self._key(key))

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=self._key(key))
            return True
        except ClientError as exc:
            if exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode") == 404:
                return False
            raise

    def list(self, prefix: str = "") -> list[str]:
        full_prefix = self._key(prefix) if prefix else (f"{self.prefix}/" if self.prefix else "")
        paginator = self.client.get_paginator("list_objects_v2")
        found = []
        for page in paginator.paginate(Bucket=self.bucket, Prefix=full_prefix):
            for item in page.get("Contents", []):
                key = item["Key"]
                found.append(key.removeprefix(f"{self.prefix}/") if self.prefix else key)
        return sorted(found)


@dataclass(frozen=True)
class TenantStorage:
    backend: BlobStorage
    tenant_id: str

    def _key(self, key: str) -> str:
        return f"tenants/{self.tenant_id}/{safe_key(key)}"

    def put(self, key: str, data: bytes, *, content_type: str) -> str:
        return self.backend.put(self._key(key), data, content_type=content_type)

    def get(self, key: str) -> bytes:
        return self.backend.get(self._key(key))

    def delete(self, key: str) -> None:
        self.backend.delete(self._key(key))

    def exists(self, key: str) -> bool:
        return self.backend.exists(self._key(key))

    def list(self, prefix: str = "") -> list[str]:
        root = f"tenants/{self.tenant_id}/"
        storage_prefix = self._key(prefix) if prefix else root
        return [item.removeprefix(root) for item in self.backend.list(storage_prefix)]


def storage_backend() -> BlobStorage:
    if settings.TELEMETRY_STORAGE_BACKEND == "filesystem":
        return FileSystemStorage()
    if settings.TELEMETRY_STORAGE_BACKEND == "s3":
        return S3Storage()
    raise ValueError("TELEMETRY_STORAGE_BACKEND must be 'filesystem' or 's3'.")


def tenant_storage(tenant_id) -> TenantStorage:
    return TenantStorage(storage_backend(), str(tenant_id))
