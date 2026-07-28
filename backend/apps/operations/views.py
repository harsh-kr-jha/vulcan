from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.audit.services import record_audit_event
from apps.common.permissions import (
    CanApproveUploads,
    CanOperateUploads,
    factories_for_request,
    tenant_for_request,
)
from apps.operations.models import Upload, UploadState
from apps.operations.serializers import UploadSerializer
from apps.operations.services import ObjectStorage
from apps.operations.tasks import inspect_upload, standardise_upload, validate_upload


class UploadViewSet(viewsets.ModelViewSet):
    serializer_class = UploadSerializer
    http_method_names = ["get", "post", "head", "options"]

    def get_permissions(self):
        if self.action == "approve":
            return [CanApproveUploads()]
        if self.action in {
            "create",
            "presigned_url",
            "complete",
            "confirm_mapping",
            "validate",
            "cancel",
        }:
            return [CanOperateUploads()]
        return [IsAuthenticated()]

    def get_queryset(self):
        tenant = tenant_for_request(self.request)
        factory_ids = factories_for_request(self.request).values_list("id", flat=True)
        return (
            Upload.objects.filter(tenant=tenant, factory_id__in=factory_ids)
            .select_related("uploaded_by", "factory")
            .order_by("-created_at")
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["tenant"] = tenant_for_request(self.request)
        return context

    def perform_create(self, serializer):
        tenant = tenant_for_request(self.request)
        upload = serializer.save(tenant=tenant, uploaded_by=self.request.user)
        record_audit_event(self.request, "upload.created", upload)

    @action(detail=True, methods=["post"], url_path="presigned-url")
    def presigned_url(self, request, pk=None):
        upload = self.get_object()
        if upload.status == UploadState.CREATED:
            upload.transition_to(UploadState.UPLOADING)
        try:
            result = ObjectStorage().presign_put(upload)
        except RuntimeError as exc:
            raise serializers.ValidationError({"storage": str(exc)}) from exc
        return Response(
            {
                "url": result.url,
                "method": result.method,
                "headers": result.headers,
                "expires_in": result.expires_in,
                "storage_key": upload.storage_key,
            }
        )

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        upload = self.get_object()
        if upload.status == UploadState.UPLOADING:
            upload.transition_to(UploadState.UPLOADED)
        if upload.status == UploadState.UPLOADED:
            upload.uploaded_at = timezone.now()
            upload.save(update_fields=["uploaded_at", "updated_at"])
            upload.transition_to(UploadState.QUEUED)
            inspect_upload.delay(str(upload.id))
        record_audit_event(request, "upload.completed", upload)
        return Response(self.get_serializer(upload).data, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=["post"], url_path="confirm-mapping")
    def confirm_mapping(self, request, pk=None):
        upload = self.get_object()
        if upload.status != UploadState.MAPPING_REQUIRED:
            raise serializers.ValidationError("Upload is not awaiting a mapping.")
        upload.transition_to(UploadState.READY_FOR_VALIDATION)
        record_audit_event(request, "mapping.confirmed", upload, metadata=request.data)
        return Response(self.get_serializer(upload).data)

    @action(detail=True, methods=["post"])
    def validate(self, request, pk=None):
        upload = self.get_object()
        if upload.status != UploadState.READY_FOR_VALIDATION:
            raise serializers.ValidationError("Upload is not ready for validation.")
        validate_upload.delay(str(upload.id))
        record_audit_event(request, "validation.started", upload)
        return Response(self.get_serializer(upload).data, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        upload = self.get_object()
        if upload.status != UploadState.VALIDATION_REVIEW:
            raise serializers.ValidationError("Only reviewed uploads can be approved.")
        upload.transition_to(UploadState.APPROVED)
        record_audit_event(request, "upload.approved", upload)
        standardise_upload.delay(str(upload.id))
        return Response(self.get_serializer(upload).data, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        upload = self.get_object()
        upload.transition_to(UploadState.CANCELLED)
        record_audit_event(request, "upload.cancelled", upload)
        return Response(self.get_serializer(upload).data)
