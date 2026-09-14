from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

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
    factory_id = getattr(request, "query_params", {}).get("factory")
    if factory_id:
        from apps.tenancy.models import Factory

        f = Factory.objects.filter(id=factory_id).first()
        if f:
            return f.tenant
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


class InventoryChangeListCreateView(generics.ListCreateAPIView):
    """List or submit inventory changes (additions or removals)."""

    serializer_class = InventoryChangeSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        layout_id = self.kwargs["layout_id"]
        return InventoryChange.objects.filter(
            inventory__layout_id=layout_id
        ).order_by("-submitted_at")

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


class DispatchEventListCreateView(generics.ListCreateAPIView):
    """List or submit dispatch events."""

    serializer_class = DispatchEventSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        layout_id = self.kwargs["layout_id"]
        return DispatchEvent.objects.filter(
            dispatch__layout_id=layout_id
        ).order_by("-submitted_at")

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


class SpatialFactoryFeedView(APIView):
    """Consolidated live telemetry, freshness status, and QR event feed for a factory."""

    permission_classes = [AllowAny]

    def get(self, request):
        from decimal import Decimal
        from django.db.models import Sum
        from django.utils import timezone

        tenant = get_tenant(request)
        factory_id = request.query_params.get("factory")
        layout_id = request.query_params.get("layout")

        layout = None
        if layout_id:
            layout = (
                FactoryLayout.objects.filter(tenant=tenant, id=layout_id)
                .prefetch_related(
                    "machines__parameters",
                    "machines__observations",
                    "inventory_config__changes",
                    "dispatch_config__events",
                )
                .first()
            )
        elif factory_id:
            layout = (
                FactoryLayout.objects.filter(tenant=tenant, factory_id=factory_id)
                .prefetch_related(
                    "machines__parameters",
                    "machines__observations",
                    "inventory_config__changes",
                    "dispatch_config__events",
                )
                .first()
            )
        else:
            layout = (
                FactoryLayout.objects.filter(tenant=tenant)
                .prefetch_related(
                    "machines__parameters",
                    "machines__observations",
                    "inventory_config__changes",
                    "dispatch_config__events",
                )
                .first()
            )

        if not layout:
            return Response(
                {
                    "layout_id": None,
                    "freshness": {
                        "machines": {
                            "status": "no_data",
                            "last_updated": None,
                            "reporting_count": 0,
                            "total_count": 0,
                        },
                        "inventory": {"status": "no_data", "last_updated": None},
                        "dispatch": {"status": "no_data", "last_updated": None},
                    },
                    "machines": [],
                    "inventory": None,
                    "dispatch": None,
                    "recent_events": [],
                }
            )

        now = timezone.now()

        def freshness_status(timestamp):
            if not timestamp:
                return "no_data"
            age = (now - timestamp).total_seconds()
            if age < 3600:
                return "fresh"
            if age < 86400:
                return "moderate"
            return "stale"

        # 1. Machines & observations
        machines_data = []
        latest_machine_time = None
        reporting_machines = 0

        for machine in layout.machines.all().order_by("display_order", "name"):
            last_obs = machine.observations.first()
            obs_count = machine.observations.count()
            if last_obs:
                reporting_machines += 1
                if latest_machine_time is None or last_obs.submitted_at > latest_machine_time:
                    latest_machine_time = last_obs.submitted_at

            history = [
                {
                    "id": str(o.id),
                    "values": o.values,
                    "submitted_at": o.submitted_at.isoformat(),
                    "submitted_by": o.submitted_by.username if o.submitted_by else None,
                }
                for o in machine.observations.all()[:10]
            ]

            machines_data.append(
                {
                    "id": str(machine.id),
                    "name": machine.name,
                    "status": machine.status,
                    "position": {"x": machine.position_x, "y": machine.position_y},
                    "size": {"width": machine.size_width, "height": machine.size_height},
                    "inputs": machine.inputs,
                    "outputs": machine.outputs,
                    "parameters": [
                        {
                            "id": str(p.id),
                            "key": p.key,
                            "data_type": p.data_type,
                            "required": p.required,
                            "order": p.order,
                        }
                        for p in machine.parameters.all()
                    ],
                    "latest_observation": (
                        {
                            "id": str(last_obs.id),
                            "values": last_obs.values,
                            "submitted_at": last_obs.submitted_at.isoformat(),
                        }
                        if last_obs
                        else None
                    ),
                    "observation_count": obs_count,
                    "history": history,
                }
            )

        # 2. Inventory
        inventory_data = None
        latest_inv_time = None
        inv_changes_list = []
        try:
            inv = layout.inventory_config
            changes = inv.changes.all()
            last_change = changes.first()
            if last_change:
                latest_inv_time = last_change.submitted_at

            stock = {}
            for mat in inv.materials or []:
                if isinstance(mat, dict) and mat.get("id"):
                    mat_id = mat["id"]
                    initial = Decimal(str(mat.get("quantity", 0)))
                    inbound = changes.filter(material_id=mat_id, direction="inbound").aggregate(
                        total=Sum("quantity")
                    )["total"] or Decimal("0")
                    outbound = changes.filter(material_id=mat_id, direction="outbound").aggregate(
                        total=Sum("quantity")
                    )["total"] or Decimal("0")
                    stock[mat_id] = float(initial + inbound - outbound)

            inv_changes_list = [
                {
                    "id": str(c.id),
                    "material_id": c.material_id,
                    "direction": c.direction,
                    "quantity": float(c.quantity),
                    "submitted_at": c.submitted_at.isoformat(),
                }
                for c in changes[:20]
            ]

            inventory_data = {
                "id": str(inv.id),
                "storage_capacity": inv.storage_capacity,
                "capacity_unit": inv.capacity_unit,
                "materials": inv.materials,
                "stock": stock,
                "latest_change": (
                    {
                        "material_id": last_change.material_id,
                        "direction": last_change.direction,
                        "quantity": float(last_change.quantity),
                        "submitted_at": last_change.submitted_at.isoformat(),
                    }
                    if last_change
                    else None
                ),
                "changes": inv_changes_list,
            }
        except InventoryConfiguration.DoesNotExist:
            pass

        # 3. Dispatch
        dispatch_data = None
        latest_disp_time = None
        disp_events_list = []
        try:
            disp = layout.dispatch_config
            events = disp.events.all()
            last_event = events.first()
            if last_event:
                latest_disp_time = last_event.submitted_at

            awaiting = {}
            dispatched = {}
            for prod in disp.products or []:
                if isinstance(prod, dict) and prod.get("id"):
                    prod_id = prod["id"]
                    arrivals = events.filter(product_id=prod_id, event_type="arrival").aggregate(
                        total=Sum("quantity")
                    )["total"] or Decimal("0")
                    disp_qty = events.filter(product_id=prod_id, event_type="dispatched").aggregate(
                        total=Sum("quantity")
                    )["total"] or Decimal("0")
                    awaiting[prod_id] = float(arrivals - disp_qty)
                    dispatched[prod_id] = float(disp_qty)

            disp_events_list = [
                {
                    "id": str(e.id),
                    "product_id": e.product_id,
                    "event_type": e.event_type,
                    "quantity": float(e.quantity),
                    "unit": e.unit,
                    "submitted_at": e.submitted_at.isoformat(),
                }
                for e in events[:20]
            ]

            dispatch_data = {
                "id": str(disp.id),
                "products": disp.products,
                "awaiting": awaiting,
                "dispatched": dispatched,
                "latest_event": (
                    {
                        "product_id": last_event.product_id,
                        "event_type": last_event.event_type,
                        "quantity": float(last_event.quantity),
                        "unit": last_event.unit,
                        "submitted_at": last_event.submitted_at.isoformat(),
                    }
                    if last_event
                    else None
                ),
                "events": disp_events_list,
            }
        except DispatchConfiguration.DoesNotExist:
            pass

        # 4. Recent combined events feed
        recent_events = []
        for m in layout.machines.all():
            for o in m.observations.all()[:10]:
                recent_events.append(
                    {
                        "id": str(o.id),
                        "source": "machine",
                        "title": f"QR observation: {m.name}",
                        "details": o.values,
                        "submitted_at": o.submitted_at.isoformat(),
                        "machine_id": str(m.id),
                        "machine_name": m.name,
                    }
                )

        if inventory_data and hasattr(layout, "inventory_config"):
            mat_name_map = {
                m["id"]: m.get("name", m["id"])
                for m in (layout.inventory_config.materials or [])
                if isinstance(m, dict) and "id" in m
            }
            for c in inv_changes_list[:15]:
                m_name = mat_name_map.get(c["material_id"], c["material_id"])
                recent_events.append(
                    {
                        "id": c["id"],
                        "source": "inventory",
                        "title": f"Inventory {c['direction']}: {m_name}",
                        "details": {
                            "material": m_name,
                            "quantity": c["quantity"],
                            "direction": c["direction"],
                        },
                        "submitted_at": c["submitted_at"],
                    }
                )

        if dispatch_data and hasattr(layout, "dispatch_config"):
            prod_name_map = {
                p["id"]: p.get("name", p["id"])
                for p in (layout.dispatch_config.products or [])
                if isinstance(p, dict) and "id" in p
            }
            for e in disp_events_list[:15]:
                p_name = prod_name_map.get(e["product_id"], e["product_id"])
                recent_events.append(
                    {
                        "id": e["id"],
                        "source": "dispatch",
                        "title": f"Dispatch {e['event_type']}: {p_name}",
                        "details": {
                            "product": p_name,
                            "quantity": e["quantity"],
                            "unit": e["unit"],
                            "type": e["event_type"],
                        },
                        "submitted_at": e["submitted_at"],
                    }
                )

        recent_events.sort(key=lambda x: x["submitted_at"], reverse=True)

        return Response(
            {
                "layout_id": str(layout.id),
                "floor": {
                    "width": float(layout.floor_width),
                    "height": float(layout.floor_height),
                    "unit": layout.unit_system,
                },
                "freshness": {
                    "machines": {
                        "status": freshness_status(latest_machine_time),
                        "last_updated": (
                            latest_machine_time.isoformat() if latest_machine_time else None
                        ),
                        "reporting_count": reporting_machines,
                        "total_count": layout.machines.count(),
                    },
                    "inventory": {
                        "status": freshness_status(latest_inv_time),
                        "last_updated": latest_inv_time.isoformat() if latest_inv_time else None,
                    },
                    "dispatch": {
                        "status": freshness_status(latest_disp_time),
                        "last_updated": latest_disp_time.isoformat() if latest_disp_time else None,
                    },
                },
                "machines": machines_data,
                "inventory": inventory_data,
                "dispatch": dispatch_data,
                "recent_events": recent_events[:50],
            }
        )
