import io
import logging
from pathlib import PurePosixPath

from django import forms
from django.conf import settings
from django.contrib import admin, messages
from django.db.models import Q
from django.http import FileResponse, Http404
from django.urls import path, reverse
from django.utils.html import format_html

from apps.spatial.models import SpatialMachine
from apps.streams.datasets import dataset_target, generate_training_datasets
from apps.streams.models import (
    DataInputStream,
    DatasetExportStatus,
    DataStreamChannel,
    MachineCycleOutcome,
    MachineStreamBinding,
    MachineTelemetrySample,
    TrainingDatasetExport,
)
from apps.streams.storage import tenant_storage

logger = logging.getLogger(__name__)


def machines_for_admin(user):
    queryset = SpatialMachine.objects.filter(
        is_active=True,
        tenant__is_active=True,
        layout__factory__is_active=True,
    ).select_related("tenant", "layout__factory", "process__parent")
    if user.is_superuser:
        return queryset.order_by("layout__factory__code", "code", "name")
    allowed = Q(
        tenant__memberships__user=user,
        tenant__memberships__is_active=True,
        tenant__memberships__all_factories=True,
    ) | Q(
        layout__factory__memberships__user=user,
        layout__factory__memberships__is_active=True,
    )
    return queryset.filter(allowed).distinct().order_by(
        "layout__factory__code", "code", "name"
    )


class TrainingDatasetExportForm(forms.ModelForm):
    class Meta:
        model = TrainingDatasetExport
        fields = ("machine", "level", "version")
        help_texts = {
            "machine": (
                "Choose the machine code. For family or line datasets, this machine selects "
                "the family or line."
            ),
            "level": (
                "Machine creates one-machine data; family and line include their related machines."
            ),
            "version": "Use a new semantic version for every immutable export, such as 1.0.0.",
        }

    def clean(self):
        cleaned = super().clean()
        if self.instance.pk:
            return cleaned
        machine = cleaned.get("machine")
        level = cleaned.get("level")
        version = cleaned.get("version")
        if not settings.ML_DATASETS_ENABLED:
            raise forms.ValidationError("ML dataset generation is disabled on this server.")
        if not machine or not level or not version:
            return cleaned
        target_key, _ = dataset_target(machine, level)
        duplicate = TrainingDatasetExport.objects.filter(
            tenant_id=machine.tenant_id,
            factory_id=machine.layout.factory_id,
            level=level,
            target_key=target_key,
            version=version,
        )
        if duplicate.exists():
            raise forms.ValidationError(
                "That dataset scope and version already exists. Choose a new version."
            )
        return cleaned


@admin.register(TrainingDatasetExport)
class TrainingDatasetExportAdmin(admin.ModelAdmin):
    form = TrainingDatasetExportForm
    list_display = (
        "target_label",
        "machine_code",
        "factory",
        "level",
        "version",
        "status",
        "row_count",
        "download_links",
        "created_at",
    )
    list_filter = ("status", "level", "factory")
    search_fields = (
        "target_label",
        "machine__code",
        "machine__name",
        "factory__code",
        "version",
    )
    fields = (
        "machine",
        "level",
        "version",
        "tenant",
        "factory",
        "target_label",
        "status",
        "row_count",
        "features",
        "checksum",
        "download_links",
        "error",
        "generated_by",
        "created_at",
    )
    readonly_fields = (
        "tenant",
        "factory",
        "target_label",
        "status",
        "row_count",
        "features",
        "checksum",
        "download_links",
        "error",
        "generated_by",
        "created_at",
    )
    ordering = ("-created_at",)

    def get_urls(self):
        own_urls = [
            path(
                "<path:object_id>/download/<str:kind>/",
                self.admin_site.admin_view(self.download_file),
                name="streams_trainingdatasetexport_download",
            )
        ]
        return own_urls + super().get_urls()

    def get_queryset(self, request):
        queryset = super().get_queryset(request).select_related(
            "tenant", "factory", "machine", "generated_by"
        )
        if request.user.is_superuser:
            return queryset
        allowed = Q(
            tenant__memberships__user=request.user,
            tenant__memberships__is_active=True,
            tenant__memberships__all_factories=True,
        ) | Q(
            factory__memberships__user=request.user,
            factory__memberships__is_active=True,
        )
        return queryset.filter(allowed).distinct()

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == "machine":
            kwargs["queryset"] = machines_for_admin(request.user)
        field = super().formfield_for_foreignkey(db_field, request, **kwargs)
        if db_field.name == "machine":
            field.label_from_instance = lambda machine: (
                f"{machine.layout.factory.code} / "
                f"{machine.code or machine.name} — {machine.name}"
            )
        return field

    def get_readonly_fields(self, request, obj=None):
        fields = list(super().get_readonly_fields(request, obj))
        if obj is not None:
            fields.extend(["machine", "level", "version"])
        return fields

    def save_model(self, request, obj, form, change):
        if change:
            super().save_model(request, obj, form, change)
            return

        obj.tenant = obj.machine.tenant
        obj.factory = obj.machine.layout.factory
        obj.target_key, obj.target_label = dataset_target(obj.machine, obj.level)
        obj.generated_by = request.user
        obj.status = DatasetExportStatus.PENDING
        super().save_model(request, obj, form, change)

        try:
            generated = generate_training_datasets(
                tenant=obj.tenant,
                factory=obj.factory,
                level=obj.level,
                version=obj.version,
                target_machine=obj.machine,
            )
            if not generated:
                raise ValueError("No telemetry samples were found for this dataset scope.")
            result = generated[0]
            obj.status = DatasetExportStatus.READY
            obj.row_count = result["rows"]
            obj.features = result["features"]
            obj.data_key = result["data_key"]
            obj.manifest_key = result["manifest_key"]
            obj.checksum = result["sha256"]
            obj.error = ""
            self.message_user(
                request,
                f"Dataset v{obj.version} is ready with {obj.row_count} rows.",
                level=messages.SUCCESS,
            )
        except Exception as exc:  # Keep a visible, auditable failure in the admin.
            logger.exception("Training dataset generation failed", extra={"export_id": obj.pk})
            obj.status = DatasetExportStatus.FAILED
            obj.error = str(exc)
            self.message_user(request, f"Dataset generation failed: {exc}", level=messages.ERROR)
        obj.save(
            update_fields=[
                "status",
                "row_count",
                "features",
                "data_key",
                "manifest_key",
                "checksum",
                "error",
                "updated_at",
            ]
        )

    @admin.display(description="Machine code", ordering="machine__code")
    def machine_code(self, obj):
        return obj.machine.code or obj.machine.name

    @admin.display(description="Files")
    def download_links(self, obj):
        if not obj or obj.status != DatasetExportStatus.READY:
            return "—"
        url_name = "admin:streams_trainingdatasetexport_download"
        data_url = reverse(url_name, args=[obj.pk, "data"])
        manifest_url = reverse(url_name, args=[obj.pk, "manifest"])
        return format_html(
            '<a href="{}">Parquet</a> · <a href="{}">Manifest</a>',
            data_url,
            manifest_url,
        )

    def download_file(self, request, object_id, kind):
        obj = self.get_object(request, object_id)
        if obj is None or not self.has_view_or_change_permission(request, obj):
            raise Http404
        if obj.status != DatasetExportStatus.READY or kind not in {"data", "manifest"}:
            raise Http404
        key = obj.data_key if kind == "data" else obj.manifest_key
        if not key:
            raise Http404
        try:
            payload = tenant_storage(obj.tenant_id).get(key)
        except FileNotFoundError as exc:
            raise Http404("Dataset file is unavailable.") from exc
        content_type = "application/vnd.apache.parquet" if kind == "data" else "application/json"
        return FileResponse(
            io.BytesIO(payload),
            as_attachment=True,
            filename=PurePosixPath(key).name,
            content_type=content_type,
        )

admin.site.register(DataInputStream)
admin.site.register(DataStreamChannel)
admin.site.register(MachineStreamBinding)
admin.site.register(MachineTelemetrySample)
admin.site.register(MachineCycleOutcome)
