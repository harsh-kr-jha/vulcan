from rest_framework import serializers

from apps.operations.models import Upload
from apps.operations.services import validate_upload_size
from apps.tenancy.models import Factory


class UploadSerializer(serializers.ModelSerializer):
    filename = serializers.CharField(source="original_filename")
    template = serializers.SerializerMethodField()
    rows = serializers.IntegerField(source="record_count", read_only=True)
    uploadedBy = serializers.CharField(source="uploaded_by.get_full_name", read_only=True)
    uploadedAt = serializers.DateTimeField(source="created_at", read_only=True)
    size = serializers.IntegerField(source="file_size")
    dataQualityScore = serializers.DecimalField(
        source="data_quality_score", max_digits=5, decimal_places=2, read_only=True
    )
    acceptedRows = serializers.IntegerField(source="accepted_rows", read_only=True)
    warningRows = serializers.IntegerField(source="warning_rows", read_only=True)
    rejectedRows = serializers.IntegerField(source="rejected_rows", read_only=True)

    class Meta:
        model = Upload
        fields = [
            "id",
            "filename",
            "factory",
            "template",
            "template_code",
            "template_version",
            "status",
            "rows",
            "acceptedRows",
            "warningRows",
            "rejectedRows",
            "dataQualityScore",
            "uploadedBy",
            "uploadedAt",
            "size",
            "file_type",
            "source_sheets",
            "failure_reason",
        ]
        read_only_fields = ["id", "status", "source_sheets", "failure_reason"]

    def get_template(self, obj) -> str:
        return f"{obj.template_code.title()} v{obj.template_version}"

    def validate_factory(self, factory: Factory):
        if factory.tenant_id != self.context["tenant"].id:
            raise serializers.ValidationError("Factory does not belong to the active tenant.")
        if not self.context["factories"].filter(pk=factory.pk).exists():
            raise serializers.ValidationError("Factory is not available to this membership.")
        return factory

    def validate(self, attrs):
        filename = attrs["original_filename"]
        extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if extension not in {"csv", "xlsx"}:
            raise serializers.ValidationError(
                {"filename": "Only CSV and XLSX files are supported."}
            )
        attrs["file_type"] = extension
        try:
            validate_upload_size(extension, attrs.get("file_size", 0))
        except ValueError as exc:
            raise serializers.ValidationError({"size": str(exc)}) from exc
        return attrs
