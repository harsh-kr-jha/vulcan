from dataclasses import dataclass
from pathlib import PurePosixPath

import boto3
from django.conf import settings
from django.utils import timezone

from apps.operations.models import Upload


@dataclass(frozen=True)
class PresignedUpload:
    url: str
    method: str
    headers: dict[str, str]
    expires_in: int


class ObjectStorage:
    """Small S3 boundary so production storage can be replaced in tests."""

    def __init__(self):
        self.bucket = settings.AWS_S3_BUCKET
        self.client = (
            boto3.client(
                "s3",
                region_name=settings.AWS_REGION,
                endpoint_url=settings.AWS_S3_ENDPOINT_URL,
            )
            if self.bucket
            else None
        )

    def build_raw_key(self, upload: Upload) -> str:
        now = timezone.now()
        safe_name = PurePosixPath(upload.original_filename).name
        return (
            f"raw/tenant-{upload.tenant_id}/factory-{upload.factory_id}/"
            f"{upload.template_code}/year={now:%Y}/month={now:%m}/"
            f"{upload.id}/{safe_name}"
        )

    def presign_put(self, upload: Upload) -> PresignedUpload:
        if not self.bucket:
            raise RuntimeError("AWS_S3_BUCKET must be configured before requesting upload URLs.")
        if self.client is None:
            raise RuntimeError("Object storage client is unavailable.")

        key = upload.storage_key or self.build_raw_key(upload)
        if upload.storage_key != key:
            upload.storage_key = key
            upload.save(update_fields=["storage_key", "updated_at"])

        url = self.client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": self.bucket,
                "Key": key,
                "ContentType": self.content_type(upload.file_type),
            },
            ExpiresIn=settings.UPLOAD_URL_TTL_SECONDS,
        )
        if settings.AWS_S3_ENDPOINT_URL and settings.AWS_S3_PUBLIC_ENDPOINT_URL:
            url = url.replace(settings.AWS_S3_ENDPOINT_URL, settings.AWS_S3_PUBLIC_ENDPOINT_URL, 1)
        return PresignedUpload(
            url=url,
            method="PUT",
            headers={"Content-Type": self.content_type(upload.file_type)},
            expires_in=settings.UPLOAD_URL_TTL_SECONDS,
        )

    @staticmethod
    def content_type(file_type: str) -> str:
        if file_type == "csv":
            return "text/csv"
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def validate_upload_size(file_type: str, file_size: int) -> None:
    limit = settings.MAX_CSV_UPLOAD_BYTES if file_type == "csv" else settings.MAX_EXCEL_UPLOAD_BYTES
    if file_size > limit:
        raise ValueError(f"{file_type.upper()} upload exceeds the configured {limit} byte limit.")
