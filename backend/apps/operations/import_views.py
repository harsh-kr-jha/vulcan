from pathlib import Path
from tempfile import NamedTemporaryFile

from django.conf import settings
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.operations.imports import (
    checksum,
    import_valid_rows,
    inspection_payload,
    serialize_upload,
    validate_mapping,
)
from apps.operations.models import Upload
from apps.tenancy.models import Factory
from apps.tenancy.services import get_workspace_identity
from processing.readers.tabular import read_rows
from processing.templates import TEMPLATES


class ImportInspectView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        identity = get_workspace_identity()
        file = request.FILES.get("file")
        dataset_type = request.data.get("datasetType", "")
        if not file or dataset_type not in TEMPLATES:
            return Response(
                {"detail": "Choose a supported dataset type and a CSV or XLSX file."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        extension = Path(file.name).suffix.lower()
        if extension not in {".csv", ".xlsx"}:
            return Response({"detail": "Only CSV and XLSX files are supported."}, status=400)
        if file.size > settings.MAX_SYNC_UPLOAD_BYTES:
            return Response(
                {
                    "detail": (
                        "This lightweight import accepts files up to "
                        f"{settings.MAX_SYNC_UPLOAD_BYTES // (1024 * 1024)} MB. "
                        "Split the source into smaller files."
                    )
                },
                status=400,
            )
        try:
            factory = Factory.objects.get(
                id=request.data.get("factory"), tenant=identity.tenant, is_active=True
            )
        except Factory.DoesNotExist:
            return Response({"detail": "Choose a valid factory."}, status=400)

        content = file.read()
        with NamedTemporaryFile(suffix=extension) as temporary:
            temporary.write(content)
            temporary.flush()
            try:
                headers, rows = read_rows(temporary.name)
            except (ValueError, OSError) as exc:
                return Response({"detail": str(exc)}, status=400)
        if not headers or not rows:
            return Response({"detail": "The selected file has no data rows."}, status=400)

        upload = Upload.objects.create(
            tenant=identity.tenant,
            factory=factory,
            original_filename=file.name,
            checksum=checksum(content),
            file_size=len(content),
            file_type=extension.removeprefix("."),
            uploaded_by=identity.user,
            template_code=dataset_type,
            template_version="1",
            dataset_type=dataset_type,
            source_type="file",
            headers=headers,
            raw_rows=rows,
            record_count=len(rows),
            status="MAPPING_REQUIRED",
        )
        return Response(inspection_payload(upload), status=status.HTTP_201_CREATED)


class ImportValidationView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, upload_id):
        upload = get_upload(upload_id)
        mapping = request.data.get("mapping")
        if not isinstance(mapping, dict):
            return Response(
                {"detail": "A source-to-standard field mapping is required."}, status=400
            )
        return Response(validate_mapping(upload, mapping))


class ImportPreviewView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, upload_id):
        upload = get_upload(upload_id)
        return Response(
            {
                "upload": serialize_upload(upload),
                "headers": upload.headers,
                "rows": upload.raw_rows[:50],
                "totalRows": len(upload.raw_rows),
                "mapping": upload.mapping,
                "omittedFields": upload.omitted_fields,
            }
        )


class ImportCommitView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, upload_id):
        identity = get_workspace_identity()
        upload = get_upload(upload_id)
        try:
            result = import_valid_rows(upload, identity.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response(result)


class ImportCancelView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, upload_id):
        upload = get_upload(upload_id)
        upload.status = "CANCELLED"
        upload.save(update_fields=["status", "updated_at"])
        return Response(serialize_upload(upload))


def get_upload(upload_id):
    return Upload.objects.select_related("factory", "tenant").get(
        id=upload_id, tenant=get_workspace_identity().tenant
    )
