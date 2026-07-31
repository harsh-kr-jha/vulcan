from datetime import date, timedelta

from django.shortcuts import get_object_or_404
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.alerts.models import ActionItem
from apps.analytics.workspace import answer_question, build_intelligence, workspace_snapshot
from apps.tenancy.models import Factory
from apps.tenancy.services import get_or_create_default_factory, get_workspace_identity


class WorkspaceView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        identity = get_workspace_identity()
        factory = resolve_factory(request, identity)
        filters = filter_values(request, factory)
        return Response(workspace_snapshot(identity, factory, filters))


class WorkspaceConfigurationView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def patch(self, request):
        identity = get_workspace_identity()
        factory = resolve_factory(request, identity)
        configuration = {**factory.configuration}
        if targets := request.data.get("targets"):
            configuration["targets"] = {**configuration.get("targets", {}), **targets}
        if industry := request.data.get("industry"):
            configuration["industry"] = industry
        if company_name := request.data.get("name"):
            name_conflict = (
                identity.tenant.companies.filter(name=company_name)
                .exclude(id=identity.company.id)
                .exists()
            )
            if name_conflict:
                return Response(
                    {"detail": "A company with this name already exists in this workspace."},
                    status=400,
                )
            identity.company.name = company_name
            identity.company.save(update_fields=["name", "updated_at"])
        if alert_status := request.data.get("alertStatus"):
            statuses = {**configuration.get("alertStatuses", {})}
            statuses[str(alert_status["id"])] = alert_status["status"]
            configuration["alertStatuses"] = statuses
        factory.configuration = configuration
        factory.save(update_fields=["configuration", "updated_at"])
        return Response(workspace_snapshot(identity, factory, filter_values(request, factory)))


class WorkspaceActionView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        identity = get_workspace_identity()
        factory = resolve_factory(request, identity)
        item = ActionItem.objects.create(
            tenant=identity.tenant,
            factory=factory,
            alert_key=request.data.get("alertId", "manual"),
            title=request.data.get("title", "Review factory issue"),
            owner=request.data.get("owner", "Factory team"),
            due_date=date.today() + timedelta(days=1),
        )
        return Response({"id": str(item.id)}, status=201)

    def patch(self, request, action_id):
        identity = get_workspace_identity()
        factory = resolve_factory(request, identity)
        item = get_object_or_404(
            ActionItem,
            id=action_id,
            tenant=identity.tenant,
            factory=factory,
        )
        item.status = "done" if item.status == "open" else "open"
        item.save(update_fields=["status", "updated_at"])
        return Response({"id": str(item.id), "status": item.status})


class WorkspaceQuestionView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        identity = get_workspace_identity()
        factory = resolve_factory(request, identity)
        filters = filter_values(request, factory)
        intelligence = build_intelligence(
            factory,
            {
                "oee": 78,
                "availability": 85,
                "performance": 95,
                "quality": 98,
                "stockCoverDays": 3,
                "downtimeMinutes": 30,
                **factory.configuration.get("targets", {}),
            },
            filters,
        )
        return Response(answer_question(intelligence, request.data.get("question", "")))


def resolve_factory(request, identity):
    factory_id = request.query_params.get("factory") or request.data.get("factory")
    if factory_id:
        return get_object_or_404(Factory, id=factory_id, tenant=identity.tenant, is_active=True)
    return get_or_create_default_factory(identity)


def filter_values(request, factory):
    source = request.query_params if request.method == "GET" else request.data.get("filters", {})
    today = date.today()
    return {
        "factoryId": str(factory.id),
        "from": source.get("from", (today - timedelta(days=6)).isoformat()),
        "to": source.get("to", today.isoformat()),
        "line": source.get("line", "all"),
        "machine": source.get("machine", "all"),
        "sku": source.get("sku", "all"),
        "shift": source.get("shift", "all"),
    }
