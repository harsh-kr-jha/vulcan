from django.contrib import admin

from .models import MappingProfile, ProcessingJob, StandardRecord, Upload, ValidationIssue


@admin.register(Upload)
class UploadAdmin(admin.ModelAdmin):
    list_display = (
        "original_filename",
        "dataset_type",
        "factory",
        "status",
        "record_count",
        "data_quality_score",
        "created_at",
    )
    list_filter = ("status", "dataset_type", "file_type", "source_type", "tenant", "factory")
    search_fields = ("original_filename", "checksum", "template_code", "factory__name")
    autocomplete_fields = ("tenant", "factory", "uploaded_by", "mapping_profile", "parent_upload")
    readonly_fields = ("id", "created_at", "updated_at")
    date_hierarchy = "created_at"


@admin.register(MappingProfile)
class MappingProfileAdmin(admin.ModelAdmin):
    list_display = (
        "template_code",
        "template_version",
        "factory",
        "version",
        "is_active",
        "approved_at",
    )
    list_filter = ("is_active", "template_code", "tenant", "factory")
    search_fields = ("template_code", "header_signature", "factory__name")
    autocomplete_fields = ("tenant", "factory", "approved_by")
    readonly_fields = ("id", "approved_at", "created_at", "updated_at")


@admin.register(ProcessingJob)
class ProcessingJobAdmin(admin.ModelAdmin):
    list_display = (
        "upload",
        "stage",
        "version",
        "status",
        "attempt_count",
        "started_at",
        "finished_at",
    )
    list_filter = ("stage", "status", "tenant")
    search_fields = ("upload__original_filename", "stage", "error")
    autocomplete_fields = ("tenant", "upload")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(ValidationIssue)
class ValidationIssueAdmin(admin.ModelAdmin):
    list_display = ("upload", "source_row", "standard_field", "severity", "rule_code", "created_at")
    list_filter = ("severity", "rule_code", "tenant")
    search_fields = ("upload__original_filename", "standard_field", "entered_value", "explanation")
    autocomplete_fields = ("tenant", "upload")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(StandardRecord)
class StandardRecordAdmin(admin.ModelAdmin):
    list_display = (
        "source_row",
        "dataset_type",
        "operational_date",
        "factory",
        "line",
        "machine",
        "sku",
        "shift",
    )
    list_filter = ("dataset_type", "operational_date", "tenant", "factory")
    search_fields = ("line", "machine", "sku", "shift", "upload__original_filename")
    autocomplete_fields = ("tenant", "factory", "upload")
    readonly_fields = ("id", "created_at", "updated_at")
    date_hierarchy = "operational_date"
