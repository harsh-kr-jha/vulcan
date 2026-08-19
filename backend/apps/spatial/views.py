from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.spatial.models import (
    DispatchConfiguration,
    FactoryLayout,
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


class FactoryLayoutListCreateView(generics.ListCreateAPIView):
    """Create a new factory layout or list layouts for the active tenant."""

    serializer_class = FactoryLayoutSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant = self.request.user.memberships.first().tenant
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
        tenant = self.request.user.memberships.first().tenant
        serializer.save(tenant=tenant)


class FactoryLayoutDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update, or delete an existing factory layout."""

    serializer_class = FactoryLayoutSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant = self.request.user.memberships.first().tenant
        return FactoryLayout.objects.filter(tenant=tenant).select_related(
            "factory"
        ).prefetch_related(
            "machines__parameters",
            "machines__custom_kpis",
            "connections",
            "inventory_config",
            "dispatch_config",
        )


class MachineEntrySchemaView(generics.RetrieveAPIView):
    """Get data entry field definitions for a specific machine."""

    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant = self.request.user.memberships.first().tenant
        return SpatialMachine.objects.filter(tenant=tenant)

    def retrieve(self, request, *args, **kwargs):
        machine = self.get_object()
        parameters = machine.parameters.all().order_by("order")
        serializer = MachineEntrySchemaSerializer(parameters, many=True)
        return Response({
            "machine_name": machine.name,
            "machine_id": str(machine.id),
            "parameters": serializer.data,
        })


class MachineObservationListCreateView(generics.ListCreateAPIView):
    """Submit or list observations for a specific machine."""

    serializer_class = MachineObservationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant = self.request.user.memberships.first().tenant
        machine_id = self.kwargs["machine_id"]
        return MachineObservation.objects.filter(
            tenant=tenant, machine_id=machine_id
        )

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["machine_id"] = self.kwargs.get("machine_id")
        return context

    def perform_create(self, serializer):
        tenant = self.request.user.memberships.first().tenant
        machine_id = self.kwargs["machine_id"]
        serializer.save(
            tenant=tenant,
            machine_id=machine_id,
            submitted_by=self.request.user,
        )


class InventoryChangeCreateView(generics.CreateAPIView):
    """Submit an inventory change (addition or removal)."""

    serializer_class = InventoryChangeSerializer
    permission_classes = [IsAuthenticated]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        tenant = self.request.user.memberships.first().tenant
        layout_id = self.kwargs["layout_id"]
        try:
            context["inventory"] = InventoryConfiguration.objects.get(
                tenant=tenant, layout_id=layout_id
            )
        except InventoryConfiguration.DoesNotExist:
            context["inventory"] = None
        return context

    def perform_create(self, serializer):
        tenant = self.request.user.memberships.first().tenant
        layout_id = self.kwargs["layout_id"]
        inventory = InventoryConfiguration.objects.get(
            tenant=tenant, layout_id=layout_id
        )
        serializer.save(
            tenant=tenant,
            inventory=inventory,
            submitted_by=self.request.user,
        )


class InventoryDetailView(generics.RetrieveAPIView):
    """Get current inventory state for a layout."""

    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant = self.request.user.memberships.first().tenant
        return InventoryConfiguration.objects.filter(tenant=tenant)

    def retrieve(self, request, *args, **kwargs):
        tenant = request.user.memberships.first().tenant
        layout_id = self.kwargs["layout_id"]
        try:
            inventory = InventoryConfiguration.objects.get(
                tenant=tenant, layout_id=layout_id
            )
        except InventoryConfiguration.DoesNotExist:
            return Response(
                {"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND
            )

        from apps.spatial.serializers import InventoryConfigurationSerializer

        serializer = InventoryConfigurationSerializer(inventory)
        return Response(serializer.data)


class DispatchEventCreateView(generics.CreateAPIView):
    """Submit a dispatch event."""

    serializer_class = DispatchEventSerializer
    permission_classes = [IsAuthenticated]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        tenant = self.request.user.memberships.first().tenant
        layout_id = self.kwargs["layout_id"]
        try:
            context["dispatch"] = DispatchConfiguration.objects.get(
                tenant=tenant, layout_id=layout_id
            )
        except DispatchConfiguration.DoesNotExist:
            context["dispatch"] = None
        return context

    def perform_create(self, serializer):
        tenant = self.request.user.memberships.first().tenant
        layout_id = self.kwargs["layout_id"]
        dispatch = DispatchConfiguration.objects.get(
            tenant=tenant, layout_id=layout_id
        )
        serializer.save(
            tenant=tenant,
            dispatch=dispatch,
            submitted_by=self.request.user,
        )


class DispatchDetailView(generics.RetrieveAPIView):
    """Get current dispatch state for a layout."""

    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant = self.request.user.memberships.first().tenant
        return DispatchConfiguration.objects.filter(tenant=tenant)

    def retrieve(self, request, *args, **kwargs):
        tenant = request.user.memberships.first().tenant
        layout_id = self.kwargs["layout_id"]
        try:
            dispatch = DispatchConfiguration.objects.get(
                tenant=tenant, layout_id=layout_id
            )
        except DispatchConfiguration.DoesNotExist:
            return Response(
                {"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND
            )

        from apps.spatial.serializers import DispatchConfigurationSerializer

        serializer = DispatchConfigurationSerializer(dispatch)
        return Response(serializer.data)
