from datetime import date, timedelta

from django.core.exceptions import ObjectDoesNotExist
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.alerts.models import ActionItem
from apps.analytics.cache import invalidate_workspace
from apps.analytics.live import build_live_dashboard
from apps.analytics.workspace import (
    DEFAULT_TARGETS,
    answer_question,
    build_intelligence,
    normalise_custom_kpis,
    normalise_targets,
    workspace_snapshot,
)
from apps.common.permissions import (
    CanManageAlerts,
    CanManageCompany,
    CanManageFactory,
    factories_for_request,
)
from apps.tenancy.services import workspace_identity_for_request


class WorkspaceView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        factory = resolve_factory(request)
        identity = workspace_identity_for_request(request, factory)
        filters = filter_values(request, factory)
        return Response(workspace_snapshot(identity, factory, filters))


class LiveDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        factory = resolve_factory(request)
        history_from = parse_datetime(request.query_params.get("from", ""))
        history_to = parse_datetime(request.query_params.get("to", ""))
        if bool(history_from) != bool(history_to):
            return Response(
                {"detail": "Choose both a start and end for the history range."}, status=400
            )
        if history_from and history_to:
            if history_from >= history_to:
                return Response({"detail": "The history start must be before its end."}, status=400)
            if history_to - history_from > timedelta(days=93):
                return Response({"detail": "History ranges are limited to 93 days."}, status=400)
        try:
            return Response(
                build_live_dashboard(
                    factory,
                    request.query_params.get("machine"),
                    history_from,
                    history_to,
                )
            )
        except ObjectDoesNotExist:
            return Response(
                {
                    "factoryId": str(factory.id),
                    "layoutExists": False,
                    "machines": [],
                    "selectedMachineId": None,
                    "current": None,
                    "generatedAt": timezone.now(),
                }
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=404)


class WorkspaceConfigurationView(APIView):
    permission_classes = [CanManageFactory]

    def patch(self, request):
        factory = resolve_factory(request)
        identity = workspace_identity_for_request(request, factory)
        configuration = {**factory.configuration}
        if "targets" in request.data:
            try:
                configuration["targets"] = normalise_targets(
                    configuration.get("targets", {}), request.data["targets"]
                )
            except ValueError as exc:
                return Response({"detail": str(exc)}, status=400)
        if industry := request.data.get("industry"):
            current_industry = factory.configuration.get("industry", "")
            if current_industry and industry != current_industry:
                return Response(
                    {"detail": "Industry is fixed for this deployment."},
                    status=400,
                )
            configuration["industry"] = industry
        if "customKpis" in request.data:
            try:
                configuration["customKpis"] = normalise_custom_kpis(request.data["customKpis"])
            except ValueError as exc:
                return Response({"detail": str(exc)}, status=400)
        if company_name := request.data.get("name"):
            if identity.membership.role not in CanManageCompany.allowed_roles:
                raise PermissionDenied(CanManageCompany.message)
            name_conflict = (
                identity.tenant.companies.filter(name=company_name)
                .exclude(id=factory.company_id)
                .exists()
            )
            if name_conflict:
                return Response(
                    {"detail": "A company with this name already exists in this workspace."},
                    status=400,
                )
            factory.company.name = company_name
            factory.company.save(update_fields=["name", "updated_at"])
        if alert_status := request.data.get("alertStatus"):
            statuses = {**configuration.get("alertStatuses", {})}
            statuses[str(alert_status["id"])] = alert_status["status"]
            configuration["alertStatuses"] = statuses
        factory.configuration = configuration
        factory.save(update_fields=["configuration", "updated_at"])
        invalidate_workspace(factory.id)
        return Response(workspace_snapshot(identity, factory, filter_values(request, factory)))


class WorkspaceActionView(APIView):
    permission_classes = [CanManageAlerts]

    def post(self, request):
        factory = resolve_factory(request)
        identity = workspace_identity_for_request(request, factory)
        item = ActionItem.objects.create(
            tenant=identity.tenant,
            factory=factory,
            alert_key=request.data.get("alertId", "manual"),
            title=request.data.get("title", "Review factory issue"),
            owner=request.data.get("owner", "Factory team"),
            due_date=date.today() + timedelta(days=1),
        )
        invalidate_workspace(factory.id)
        return Response({"id": str(item.id)}, status=201)

    def patch(self, request, action_id):
        factory = resolve_factory(request)
        identity = workspace_identity_for_request(request, factory)
        item = get_object_or_404(
            ActionItem,
            id=action_id,
            tenant=identity.tenant,
            factory=factory,
        )
        item.status = "done" if item.status == "open" else "open"
        item.save(update_fields=["status", "updated_at"])
        invalidate_workspace(factory.id)
        return Response({"id": str(item.id), "status": item.status})


class WorkspaceQuestionView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        factory = resolve_factory(request)
        filters = filter_values(request, factory)
        intelligence = build_intelligence(
            factory,
            {
                **DEFAULT_TARGETS,
                **factory.configuration.get("targets", {}),
            },
            filters,
        )
        return Response(answer_question(intelligence, request.data.get("question", "")))


def resolve_factory(request):
    factory_id = request.query_params.get("factory") or request.data.get("factory")
    if factory_id:
        return get_object_or_404(factories_for_request(request), id=factory_id)
    factory = factories_for_request(request).first()
    if factory is None:
        raise NotFound("No factory is available to this membership.")
    return factory


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
