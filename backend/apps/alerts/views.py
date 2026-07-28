from rest_framework import mixins, viewsets
from rest_framework.permissions import IsAuthenticated

from apps.alerts.models import Alert
from apps.alerts.serializers import AlertSerializer
from apps.audit.services import record_audit_event
from apps.common.permissions import CanManageAlerts, factories_for_request, tenant_for_request


class AlertViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = AlertSerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_permissions(self):
        if self.action in {"update", "partial_update"}:
            return [CanManageAlerts()]
        return [IsAuthenticated()]

    def get_queryset(self):
        tenant = tenant_for_request(self.request)
        factory_ids = factories_for_request(self.request).values_list("id", flat=True)
        queryset = (
            Alert.objects.filter(tenant=tenant, factory_id__in=factory_ids)
            .select_related("rule", "factory", "line", "machine")
            .order_by("-generated_at")
        )
        if status_value := self.request.query_params.get("status"):
            queryset = queryset.filter(status=status_value)
        if severity := self.request.query_params.get("severity"):
            queryset = queryset.filter(severity=severity)
        return queryset

    def perform_update(self, serializer):
        alert = serializer.save()
        record_audit_event(
            self.request,
            f"alert.{alert.status}",
            alert,
            metadata={"status": alert.status},
        )
