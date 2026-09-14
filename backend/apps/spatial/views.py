from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.spatial.models import (
    DispatchConfiguration,
    DispatchEvent,
    FactoryLayout,
    InventoryChange,
    InventoryConfiguration,
    MachineObservation,
    SpatialMachine,
)
from apps.spatial.serializers import (
    DispatchEventSerializer,
    FactoryLayoutSerializer,
    InventoryChangeSerializer,
    MachineEntrySchemaSerializer,
    MachineObservationSerializer,
)


def get_tenant(request):
    if hasattr(request, "user") and request.user.is_authenticated:
        memberships = getattr(request.user, "memberships", None)
        if memberships and memberships.exists():
            return memberships.first().tenant
    try:
        from apps.tenancy.services import get_workspace_identity

        return get_workspace_identity().tenant
    except Exception:
        pass
    from apps.tenancy.models import Tenant

    tenant = Tenant.objects.first()
    if tenant:
        return tenant
    tenant, _ = Tenant.objects.get_or_create(
        slug="vulcan-workspace", defaults={"name": "Vulcan Workspace"}
    )
    return tenant


def get_user(request):
    if hasattr(request, "user") and request.user.is_authenticated:
        return request.user
    from django.contrib.auth import get_user_model

    User = get_user_model()
    return User.objects.first()


class FactoryLayoutListCreateView(generics.ListCreateAPIView):
    """Create a new factory layout or list layouts for the active tenant."""

    serializer_class = FactoryLayoutSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        tenant = get_tenant(self.request)
        queryset = FactoryLayout.objects.filter(tenant=tenant)
        factory_id = self.request.query_params.get("factory")
        if factory_id:
            queryset = queryset.filter(factory_id=factory_id)
        return queryset.select_related("factory").prefetch_related(
            "machines__parameters",
            "machines__custom_kpis",
            "connections",
            "inventory_config",
            "dispatch_config",
        )

    def perform_create(self, serializer):
        tenant = get_tenant(self.request)
        serializer.save(tenant=tenant)


class FactoryLayoutDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update, or delete an existing factory layout."""

    serializer_class = FactoryLayoutSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        tenant = get_tenant(self.request)
        return (
            FactoryLayout.objects.filter(tenant=tenant)
            .select_related("factory")
            .prefetch_related(
                "machines__parameters",
                "machines__custom_kpis",
                "connections",
                "inventory_config",
                "dispatch_config",
            )
        )


class MachineEntrySchemaView(generics.RetrieveAPIView):
    """Get data entry field definitions for a specific machine.

    Returns parameters (user-defined fields) plus auto-generated fields
    from inputs and outputs so QR data entry covers all machine data points.
    """

    permission_classes = [AllowAny]

    def get_queryset(self):
        tenant = get_tenant(self.request)
        return SpatialMachine.objects.filter(tenant=tenant)

    def retrieve(self, request, *args, **kwargs):
        machine = self.get_object()
        parameters = machine.parameters.all().order_by("order")
        serializer = MachineEntrySchemaSerializer(parameters, many=True)

        # Build input/output fields from machine's inputs/outputs JSON
        io_fields = []
        for io_item in machine.inputs or []:
            if isinstance(io_item, dict) and io_item.get("label"):
                io_fields.append(
                    {
                        "id": io_item.get("id", ""),
                        "key": f"input_{io_item['id']}",
                        "label": f"Input: {io_item['label']}",
                        "unit_type": io_item.get("unitType", ""),
                        "data_type": "number",
                        "options": [],
                        "required": False,
                        "order": 900 + len(io_fields),
                        "io_type": "input",
                    }
                )
        for io_item in machine.outputs or []:
            if isinstance(io_item, dict) and io_item.get("label"):
                io_fields.append(
                    {
                        "id": io_item.get("id", ""),
                        "key": f"output_{io_item['id']}",
                        "label": f"Output: {io_item['label']}",
                        "unit_type": io_item.get("unitType", ""),
                        "data_type": "number",
                        "options": [],
                        "required": False,
                        "order": 950 + len(io_fields),
                        "io_type": "output",
                    }
                )

        return Response(
            {
                "machine_name": machine.name,
                "machine_id": str(machine.id),
                "parameters": serializer.data,
                "io_fields": io_fields,
            }
        )


class MachineObservationListCreateView(generics.ListCreateAPIView):
    """Submit or list observations for a specific machine."""

    serializer_class = MachineObservationSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        tenant = get_tenant(self.request)
        machine_id = self.kwargs["machine_id"]
        return MachineObservation.objects.filter(tenant=tenant, machine_id=machine_id)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["machine_id"] = self.kwargs.get("machine_id")
        return context

    def perform_create(self, serializer):
        tenant = get_tenant(self.request)
        machine_id = self.kwargs["machine_id"]
        serializer.save(
            tenant=tenant,
            machine_id=machine_id,
            submitted_by=get_user(self.request),
        )


class InventoryChangeCreateView(generics.CreateAPIView):
    """Submit an inventory change (addition or removal)."""

    serializer_class = InventoryChangeSerializer
    permission_classes = [AllowAny]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        tenant = get_tenant(self.request)
        layout_id = self.kwargs["layout_id"]
        try:
            context["inventory"] = InventoryConfiguration.objects.get(
                tenant=tenant, layout_id=layout_id
            )
        except InventoryConfiguration.DoesNotExist:
            context["inventory"] = None
        return context

    def perform_create(self, serializer):
        tenant = get_tenant(self.request)
        layout_id = self.kwargs["layout_id"]
        inventory = InventoryConfiguration.objects.get(tenant=tenant, layout_id=layout_id)
        serializer.save(
            tenant=tenant,
            inventory=inventory,
            submitted_by=get_user(self.request),
        )


class InventoryDetailView(generics.RetrieveAPIView):
    """Get current inventory state for a layout, including computed stock levels."""

    permission_classes = [AllowAny]

    def get_queryset(self):
        tenant = get_tenant(self.request)
        return InventoryConfiguration.objects.filter(tenant=tenant)

    def retrieve(self, request, *args, **kwargs):
        from decimal import Decimal

        from django.db.models import Sum

        tenant = get_tenant(request)
        layout_id = self.kwargs["layout_id"]
        try:
            inventory = InventoryConfiguration.objects.get(tenant=tenant, layout_id=layout_id)
        except InventoryConfiguration.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        from apps.spatial.serializers import InventoryConfigurationSerializer

        serializer = InventoryConfigurationSerializer(inventory)
        data = serializer.data

        # Compute live stock for each material
        materials = inventory.materials or []
        stock = {}
        changes = InventoryChange.objects.filter(inventory=inventory)
        for material in materials:
            if not isinstance(material, dict):
                continue
            mat_id = material.get("id")
            if not mat_id:
                continue
            initial = Decimal(str(material.get("quantity", 0)))
            inbound = changes.filter(material_id=mat_id, direction="inbound").aggregate(
                total=Sum("quantity")
            )["total"] or Decimal("0")
            outbound = changes.filter(material_id=mat_id, direction="outbound").aggregate(
                total=Sum("quantity")
            )["total"] or Decimal("0")
            stock[mat_id] = float(initial + inbound - outbound)

        data["stock"] = stock
        return Response(data)


class DispatchEventCreateView(generics.CreateAPIView):
    """Submit a dispatch event."""

    serializer_class = DispatchEventSerializer
    permission_classes = [AllowAny]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        tenant = get_tenant(self.request)
        layout_id = self.kwargs["layout_id"]
        try:
            context["dispatch"] = DispatchConfiguration.objects.get(
                tenant=tenant, layout_id=layout_id
            )
        except DispatchConfiguration.DoesNotExist:
            context["dispatch"] = None
        return context

    def perform_create(self, serializer):
        tenant = get_tenant(self.request)
        layout_id = self.kwargs["layout_id"]
        dispatch = DispatchConfiguration.objects.get(tenant=tenant, layout_id=layout_id)
        serializer.save(
            tenant=tenant,
            dispatch=dispatch,
            submitted_by=get_user(self.request),
        )


class DispatchDetailView(generics.RetrieveAPIView):
    """Get current dispatch state for a layout, including computed awaiting quantities."""

    permission_classes = [AllowAny]

    def get_queryset(self):
        tenant = get_tenant(self.request)
        return DispatchConfiguration.objects.filter(tenant=tenant)

    def retrieve(self, request, *args, **kwargs):
        from decimal import Decimal

        from django.db.models import Sum

        tenant = get_tenant(request)
        layout_id = self.kwargs["layout_id"]
        try:
            dispatch = DispatchConfiguration.objects.get(tenant=tenant, layout_id=layout_id)
        except DispatchConfiguration.DoesNotExist:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        from apps.spatial.serializers import DispatchConfigurationSerializer

        serializer = DispatchConfigurationSerializer(dispatch)
        data = serializer.data

        # Compute awaiting quantity per product: sum(arrival) - sum(dispatched)
        products = dispatch.products or []
        awaiting = {}
        dispatched_totals = {}
        events = DispatchEvent.objects.filter(dispatch=dispatch)
        for product in products:
            if not isinstance(product, dict):
                continue
            prod_id = product.get("id")
            if not prod_id:
                continue
            arrivals = events.filter(product_id=prod_id, event_type="arrival").aggregate(
                total=Sum("quantity")
            )["total"] or Decimal("0")
            dispatched = events.filter(product_id=prod_id, event_type="dispatched").aggregate(
                total=Sum("quantity")
            )["total"] or Decimal("0")
            awaiting[prod_id] = float(arrivals - dispatched)
            dispatched_totals[prod_id] = float(dispatched)

        data["awaiting"] = awaiting
        data["dispatched"] = dispatched_totals
        return Response(data)
