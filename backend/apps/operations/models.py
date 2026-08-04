from django.conf import settings
from django.db import models, transaction

from apps.common.models import TenantScopedModel, UUIDModel
from apps.tenancy.models import Factory


class UploadState(models.TextChoices):
    CREATED = "CREATED", "Created"
    UPLOADING = "UPLOADING", "Uploading"
    UPLOADED = "UPLOADED", "Uploaded"
    QUEUED = "QUEUED", "Queued"
    INSPECTING = "INSPECTING", "Inspecting"
    MAPPING_REQUIRED = "MAPPING_REQUIRED", "Mapping required"
    READY_FOR_VALIDATION = "READY_FOR_VALIDATION", "Ready for validation"
    VALIDATING = "VALIDATING", "Validating"
    VALIDATION_REVIEW = "VALIDATION_REVIEW", "Validation review"
    APPROVED = "APPROVED", "Approved"
    STANDARDISING = "STANDARDISING", "Standardising"
    CALCULATING_KPIS = "CALCULATING_KPIS", "Calculating KPIs"
    GENERATING_ALERTS = "GENERATING_ALERTS", "Generating alerts"
    COMPLETED = "COMPLETED", "Completed"
    UPLOAD_FAILED = "UPLOAD_FAILED", "Upload failed"
    INSPECTION_FAILED = "INSPECTION_FAILED", "Inspection failed"
    VALIDATION_FAILED = "VALIDATION_FAILED", "Validation failed"
    STANDARDISATION_FAILED = "STANDARDISATION_FAILED", "Standardisation failed"
    ANALYTICS_FAILED = "ANALYTICS_FAILED", "Analytics failed"
    CANCELLED = "CANCELLED", "Cancelled"


ALLOWED_TRANSITIONS = {
    UploadState.CREATED: {UploadState.UPLOADING, UploadState.CANCELLED},
    UploadState.UPLOADING: {UploadState.UPLOADED, UploadState.UPLOAD_FAILED, UploadState.CANCELLED},
    UploadState.UPLOADED: {UploadState.QUEUED, UploadState.CANCELLED},
    UploadState.QUEUED: {UploadState.INSPECTING, UploadState.CANCELLED},
    UploadState.INSPECTING: {
        UploadState.MAPPING_REQUIRED,
        UploadState.READY_FOR_VALIDATION,
        UploadState.INSPECTION_FAILED,
    },
    UploadState.MAPPING_REQUIRED: {UploadState.READY_FOR_VALIDATION, UploadState.CANCELLED},
    UploadState.READY_FOR_VALIDATION: {UploadState.VALIDATING, UploadState.CANCELLED},
    UploadState.VALIDATING: {UploadState.VALIDATION_REVIEW, UploadState.VALIDATION_FAILED},
    UploadState.VALIDATION_REVIEW: {UploadState.APPROVED, UploadState.CANCELLED},
    UploadState.APPROVED: {UploadState.STANDARDISING},
    UploadState.STANDARDISING: {UploadState.CALCULATING_KPIS, UploadState.STANDARDISATION_FAILED},
    UploadState.CALCULATING_KPIS: {UploadState.GENERATING_ALERTS, UploadState.ANALYTICS_FAILED},
    UploadState.GENERATING_ALERTS: {UploadState.COMPLETED, UploadState.ANALYTICS_FAILED},
}


class Upload(UUIDModel, TenantScopedModel):
    factory = models.ForeignKey(Factory, on_delete=models.PROTECT, related_name="uploads")
    original_filename = models.CharField(max_length=255)
    checksum = models.CharField(max_length=64, blank=True)
    storage_key = models.CharField(max_length=600, blank=True)
    file_size = models.PositiveBigIntegerField(default=0)
    file_type = models.CharField(max_length=12)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    uploaded_at = models.DateTimeField(null=True, blank=True)
    template_code = models.CharField(max_length=80)
    template_version = models.CharField(max_length=30)
    mapping_profile = models.ForeignKey(
        "MappingProfile", on_delete=models.SET_NULL, null=True, blank=True, related_name="uploads"
    )
    parent_upload = models.ForeignKey("self", on_delete=models.PROTECT, null=True, blank=True)
    source_sheets = models.JSONField(default=list, blank=True)
    record_count = models.PositiveBigIntegerField(default=0)
    accepted_rows = models.PositiveBigIntegerField(default=0)
    warning_rows = models.PositiveBigIntegerField(default=0)
    rejected_rows = models.PositiveBigIntegerField(default=0)
    data_quality_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    file_version = models.PositiveIntegerField(default=1)
    processing_version = models.CharField(max_length=30, default="1.0")
    status = models.CharField(
        max_length=40, choices=UploadState.choices, default=UploadState.CREATED
    )
    failure_reason = models.TextField(blank=True)
    dataset_type = models.CharField(max_length=30, blank=True)
    source_type = models.CharField(max_length=30, default="file")
    headers = models.JSONField(default=list, blank=True)
    raw_rows = models.JSONField(default=list, blank=True)
    import_context = models.JSONField(default=dict, blank=True)
    mapping = models.JSONField(default=dict, blank=True)
    omitted_fields = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["tenant", "factory", "status", "-created_at"]),
            models.Index(fields=["tenant", "checksum"]),
        ]

    @transaction.atomic
    def transition_to(self, next_state: str) -> None:
        current = type(self).objects.select_for_update().get(pk=self.pk)
        allowed = ALLOWED_TRANSITIONS.get(current.status, set())
        if next_state not in allowed:
            raise ValueError(f"Cannot transition upload from {current.status} to {next_state}.")
        current.status = next_state
        current.save(update_fields=["status", "updated_at"])
        self.status = next_state


class MappingProfile(UUIDModel, TenantScopedModel):
    factory = models.ForeignKey(Factory, on_delete=models.PROTECT, related_name="mapping_profiles")
    template_code = models.CharField(max_length=80)
    template_version = models.CharField(max_length=30)
    header_signature = models.CharField(max_length=64)
    mappings = models.JSONField(default=dict)
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    approved_at = models.DateTimeField(auto_now_add=True)
    version = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["factory", "template_code", "template_version", "header_signature"],
                name="unique_mapping_header_signature",
            )
        ]


class ProcessingJob(UUIDModel, TenantScopedModel):
    upload = models.ForeignKey(Upload, on_delete=models.CASCADE, related_name="jobs")
    stage = models.CharField(max_length=50)
    version = models.CharField(max_length=30)
    status = models.CharField(max_length=30, default="pending")
    attempt_count = models.PositiveIntegerField(default=0)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    error = models.TextField(blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["upload", "stage", "version"], name="unique_upload_processing_stage"
            )
        ]


class ValidationIssue(UUIDModel, TenantScopedModel):
    upload = models.ForeignKey(Upload, on_delete=models.CASCADE, related_name="validation_issues")
    source_sheet = models.CharField(max_length=160, blank=True)
    source_row = models.PositiveBigIntegerField(null=True, blank=True)
    source_column = models.CharField(max_length=160, blank=True)
    standard_field = models.CharField(max_length=160, blank=True)
    entered_value = models.TextField(blank=True)
    severity = models.CharField(max_length=20)
    rule_code = models.CharField(max_length=80)
    explanation = models.TextField()
    suggested_correction = models.TextField(blank=True)
    validation_version = models.CharField(max_length=30)

    class Meta:
        indexes = [
            models.Index(fields=["tenant", "upload", "severity"]),
            models.Index(fields=["tenant", "rule_code"]),
        ]


class StandardRecord(UUIDModel, TenantScopedModel):
    """A validated operational row with searchable dimensions and preserved lineage."""

    upload = models.ForeignKey(Upload, on_delete=models.CASCADE, related_name="standard_records")
    factory = models.ForeignKey(Factory, on_delete=models.CASCADE, related_name="standard_records")
    dataset_type = models.CharField(max_length=30)
    source_row = models.PositiveBigIntegerField()
    operational_date = models.DateField(null=True, blank=True)
    line = models.CharField(max_length=160, blank=True)
    machine = models.CharField(max_length=160, blank=True)
    sku = models.CharField(max_length=160, blank=True)
    shift = models.CharField(max_length=160, blank=True)
    values = models.JSONField(default=dict)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["upload", "source_row"], name="unique_standard_record_source_row"
            )
        ]
        indexes = [
            models.Index(fields=["tenant", "factory", "dataset_type", "operational_date"]),
            models.Index(fields=["tenant", "factory", "line", "machine"]),
        ]
