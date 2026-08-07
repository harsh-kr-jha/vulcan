from io import BytesIO
from pathlib import Path
from tempfile import NamedTemporaryFile

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models.deletion import ProtectedError
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import (
    CanApproveUploads,
    CanOperateUploads,
    factories_for_request,
    tenant_for_request,
)
from apps.operations.imports import (
    checksum,
    import_valid_rows,
    inspection_payload,
    serialize_upload,
    validate_mapping,
)
from apps.operations.models import Upload
from apps.tenancy.models import Factory, FactoryMaster
from processing.readers.tabular import read_rows
from processing.templates import templates_for_variant

TEMPLATE_EXAMPLES = {
    "projects": [
        "MUS-2608-R1",
        "NCR Fresh Programme",
        "Button mushroom cycle · Growing Room 1",
        "MUS-PROG-01",
        "Button mushroom",
        3600,
        "kg",
        "Growing Wing A",
        504_000,
        "2026-06-12",
        "2026-06-19",
        "2026-08-08",
        "2026-08-11",
        "",
        "High",
        "In Progress",
        58,
        "Asha Verma|Crop lead; Ravi Malik|Room operations",
    ],
    "project_stages": [
        "MUS-2608-R1",
        "COMPOST-PREP",
        "Compost Preparation",
        1,
        "Completed",
        100,
        "2026-06-19",
        "2026-06-19",
        "2026-06-30",
        "2026-06-30",
        "Asha Verma",
        0,
        "Compost recipe and turn log verified",
        "compost-recipe.pdf; compost-temperature-log.pdf",
    ],
}

AUTOMOTIVE_TEMPLATE_EXAMPLES = {
    "projects": [
        "AUTO-2026-001", "OEM Customer", "New component production launch", "PO-2026-001",
        "Production launch", 12000, "units", "Assembly Line 1", 2400000, "2026-06-12",
        "2026-06-19", "2026-08-08", "2026-08-10", "", "High", "In Progress", 58,
        "Priya Rao|Programme lead; Arjun Singh|Production engineering",
    ],
    "project_stages": [
        "AUTO-2026-001", "TOOL-TRIAL", "Tooling trial", 1, "Completed", 100,
        "2026-06-19", "2026-06-19", "2026-06-25", "2026-06-25", "Arjun Singh", 0,
        "Trial output and dimensional report approved", "trial-report.pdf; dimensional-report.pdf",
    ],
    "utilities": [
        "2026-07-31", "Shift A", "Biomass Boiler BB-01", 10000, 30, 70,
        9000, 4500, 450, 1800, 3800, 72,
    ],
}


class ImportTemplateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, dataset_type):
        fields = templates_for_variant(settings.VULCAN_VARIANT).get(dataset_type)
        if not fields:
            return Response({"detail": "Choose a supported dataset type."}, status=404)
        workbook = Workbook()
        worksheet = workbook.active
        worksheet.title = dataset_type.replace("_", " ").title()[:31]
        worksheet.append([field.key for field in fields])
        examples = (
            TEMPLATE_EXAMPLES
            if settings.VULCAN_VARIANT == "mushroom"
            else AUTOMOTIVE_TEMPLATE_EXAMPLES
        )
        if dataset_type in examples:
            worksheet.append(examples[dataset_type])
        for cell in worksheet[1]:
            cell.font = Font(bold=True, color="FFFFFF")
            cell.fill = PatternFill("solid", fgColor="416F57")
        worksheet.freeze_panes = "A2"
        for column in worksheet.columns:
            width = min(max(len(str(cell.value or "")) for cell in column) + 3, 42)
            worksheet.column_dimensions[column[0].column_letter].width = width
        content = BytesIO()
        workbook.save(content)
        workbook.close()
        response = HttpResponse(
            content.getvalue(),
            content_type=("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        )
        response["Content-Disposition"] = (
            f'attachment; filename="{settings.VULCAN_VARIANT}_{dataset_type}_template.xlsx"'
        )
        return response


class ImportInspectView(APIView):
    permission_classes = [CanOperateUploads]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        templates = templates_for_variant(settings.VULCAN_VARIANT)
        tenant = tenant_for_request(request)
        file = request.FILES.get("file")
        dataset_type = request.data.get("datasetType", "")
        if not file or dataset_type not in templates:
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
            factory = factories_for_request(request).get(id=request.data.get("factory"))
        except (Factory.DoesNotExist, DjangoValidationError, ValueError):
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

        import_context = {}
        if dataset_type == "process" and request.data.get("process"):
            try:
                process = FactoryMaster.objects.get(
                    id=request.data["process"],
                    factory=factory,
                    kind="processes",
                    is_active=True,
                )
            except (FactoryMaster.DoesNotExist, DjangoValidationError, ValueError):
                return Response({"detail": "Choose a valid factory process."}, status=400)
            import_context = {
                "processId": str(process.id),
                "processCode": process.code,
                "processName": process.name,
            }

        upload = Upload.objects.create(
            tenant=tenant,
            factory=factory,
            original_filename=file.name,
            checksum=checksum(content),
            file_size=len(content),
            file_type=extension.removeprefix("."),
            uploaded_by=request.user,
            template_code=dataset_type,
            template_version="1",
            dataset_type=dataset_type,
            source_type="file",
            headers=headers,
            raw_rows=rows,
            import_context=import_context,
            record_count=len(rows),
            status="MAPPING_REQUIRED",
        )
        return Response(inspection_payload(upload), status=status.HTTP_201_CREATED)


class ImportValidationView(APIView):
    permission_classes = [CanOperateUploads]

    def post(self, request, upload_id):
        upload = get_upload(request, upload_id)
        mapping = request.data.get("mapping")
        if not isinstance(mapping, dict):
            return Response(
                {"detail": "A source-to-standard field mapping is required."}, status=400
            )
        return Response(validate_mapping(upload, mapping))


class ImportPreviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, upload_id):
        upload = get_upload(request, upload_id)
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


class ImportEditView(APIView):
    """Return the stored source and mapping so it can be revalidated in place."""

    permission_classes = [IsAuthenticated]

    def get(self, request, upload_id):
        return Response(inspection_payload(get_upload(request, upload_id)))


class ImportDeleteView(APIView):
    permission_classes = [CanOperateUploads]

    def delete(self, request, upload_id):
        upload = get_upload(request, upload_id)
        try:
            upload.delete()
        except ProtectedError:
            return Response(
                {"detail": "This source is used by a later import and cannot be deleted."},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ImportCommitView(APIView):
    permission_classes = [CanApproveUploads]

    def post(self, request, upload_id):
        upload = get_upload(request, upload_id)
        try:
            result = import_valid_rows(upload, request.user)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response(result)


class ImportCancelView(APIView):
    permission_classes = [CanOperateUploads]

    def post(self, request, upload_id):
        upload = get_upload(request, upload_id)
        upload.status = "CANCELLED"
        upload.save(update_fields=["status", "updated_at"])
        return Response(serialize_upload(upload))


def get_upload(request, upload_id):
    return get_object_or_404(
        Upload.objects.select_related("factory", "tenant"),
        id=upload_id,
        tenant=tenant_for_request(request),
        factory_id__in=factories_for_request(request).values("id"),
    )
