import hashlib

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.common.permissions import CanManageFactory, factories_for_request, tenant_for_request
from apps.spatial.models import (
    DispatchConfiguration,
    DispatchEvent,
    FactoryLayout,
    FactoryModelAsset,
    InventoryChange,
    InventoryConfiguration,
    MachineImageAsset,
    MachineModelAsset,
    MachineObservation,
    SpatialMachine,
)
from apps.spatial.serializers import (
    DispatchEventSerializer,
    FactoryLayoutSerializer,
    FactoryModelAssetSerializer,
    InventoryChangeSerializer,
    MachineEntrySchemaSerializer,
    MachineImageAssetSerializer,
    MachineModelAssetSerializer,
    MachineObservationSerializer,
)
from apps.spatial.services import update_machine_current_state
from apps.streams.storage import tenant_storage


class FactoryLayoutListCreateView(generics.ListCreateAPIView):
    """Create a new factory layout or list layouts for the active tenant."""

    serializer_class = FactoryLayoutSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        return [CanManageFactory()] if self.request.method == "POST" else [IsAuthenticated()]

    def get_queryset(self):
        tenant = tenant_for_request(self.request)
        queryset = FactoryLayout.objects.filter(
            tenant=tenant, factory__in=factories_for_request(self.request), is_active=True
        )
        factory_id = self.request.query_params.get("factory")
        if factory_id:
            queryset = queryset.filter(factory_id=factory_id)
        return queryset.select_related("factory").prefetch_related(
            "machines__parameters",
            "machines__custom_kpis",
            "machines__model_asset",
            "machines__image_asset",
            "machines__stream_binding__channel__stream",
            "connections",
            "zones__line",
            "model_asset",
            "inventory_config",
            "dispatch_config",
        )

    def perform_create(self, serializer):
        tenant = tenant_for_request(self.request)
        serializer.save(tenant=tenant)


class FactoryLayoutDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Retrieve, update, or delete an existing factory layout."""

    serializer_class = FactoryLayoutSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        return (
            [CanManageFactory()]
            if self.request.method in {"PUT", "PATCH", "DELETE"}
            else [IsAuthenticated()]
        )

    def get_queryset(self):
        tenant = tenant_for_request(self.request)
        return (
            FactoryLayout.objects.filter(
                tenant=tenant, factory__in=factories_for_request(self.request)
            )
            .select_related("factory")
            .prefetch_related(
                "machines__parameters",
                "machines__custom_kpis",
                "machines__model_asset",
                "machines__image_asset",
                "machines__stream_binding__channel__stream",
                "connections",
                "zones__line",
                "model_asset",
                "inventory_config",
                "dispatch_config",
            )
        )

    def destroy(self, request, *args, **kwargs):
        return Response(
            {"detail": "Factory layouts are retained for operational history."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )


class FactoryModelAssetView(generics.GenericAPIView):
    """Upload or stream the optional low-poly GLB shell for one layout."""

    permission_classes = [IsAuthenticated]
    serializer_class = FactoryModelAssetSerializer
    MAX_BYTES = 15 * 1024 * 1024

    def get_permissions(self):
        return (
            [CanManageFactory()]
            if self.request.method in {"POST", "DELETE"}
            else [IsAuthenticated()]
        )

    def _layout(self):
        return get_object_or_404(
            FactoryLayout.objects.filter(
                tenant=tenant_for_request(self.request),
                factory__in=factories_for_request(self.request),
            ),
            pk=self.kwargs["layout_id"],
        )

    def get(self, request, *args, **kwargs):
        layout = self._layout()
        asset = get_object_or_404(FactoryModelAsset, layout=layout)
        etag = f'"{asset.checksum_sha256}"'
        if request.headers.get("If-None-Match") == etag:
            return HttpResponse(status=304)
        try:
            payload = tenant_storage(layout.tenant_id).get(asset.storage_key)
        except (FileNotFoundError, ValueError):
            return Response({"detail": "The model asset is unavailable."}, status=404)
        response = HttpResponse(payload, content_type="model/gltf-binary")
        response["Content-Disposition"] = f'inline; filename="{asset.filename}"'
        response["Content-Length"] = str(len(payload))
        response["Cache-Control"] = "private, max-age=3600"
        response["ETag"] = etag
        return response

    def post(self, request, *args, **kwargs):
        layout = self._layout()
        upload = request.FILES.get("file")
        if not upload:
            return Response({"file": "Choose a .glb file."}, status=400)
        if not upload.name.lower().endswith(".glb"):
            return Response({"file": "Only binary .glb files are supported."}, status=400)
        if upload.size > self.MAX_BYTES:
            return Response({"file": "GLB files must be 15 MB or smaller."}, status=400)
        payload = upload.read()
        if len(payload) < 12 or payload[:4] != b"glTF":
            return Response({"file": "The file is not a valid binary glTF container."}, status=400)
        digest = hashlib.sha256(payload).hexdigest()
        key = f"spatial/models/{layout.id}/{digest}.glb"
        tenant_storage(layout.tenant_id).put(key, payload, content_type="model/gltf-binary")
        asset, _ = FactoryModelAsset.objects.update_or_create(
            layout=layout,
            defaults={
                "tenant": layout.tenant,
                "filename": upload.name[:240],
                "storage_key": key,
                "content_type": "model/gltf-binary",
                "size_bytes": len(payload),
                "checksum_sha256": digest,
            },
        )
        return Response(self.get_serializer(asset).data, status=201)

    def delete(self, request, *args, **kwargs):
        layout = self._layout()
        asset = get_object_or_404(FactoryModelAsset, layout=layout)
        tenant_storage(layout.tenant_id).delete(asset.storage_key)
        asset.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MachineModelAssetView(generics.GenericAPIView):
    """Upload or stream one low-poly GLB representation for a machine."""

    permission_classes = [IsAuthenticated]
    serializer_class = MachineModelAssetSerializer
    MAX_BYTES = 8 * 1024 * 1024

    def get_permissions(self):
        return (
            [CanManageFactory()]
            if self.request.method in {"POST", "DELETE"}
            else [IsAuthenticated()]
        )

    def _machine(self):
        return get_object_or_404(
            SpatialMachine.objects.select_related("layout").filter(
                tenant=tenant_for_request(self.request),
                layout__factory__in=factories_for_request(self.request),
                is_active=True,
            ),
            pk=self.kwargs["machine_id"],
        )

    def get(self, request, *args, **kwargs):
        machine = self._machine()
        asset = get_object_or_404(MachineModelAsset, machine=machine)
        etag = f'"{asset.checksum_sha256}"'
        if request.headers.get("If-None-Match") == etag:
            return HttpResponse(status=304)
        try:
            payload = tenant_storage(machine.tenant_id).get(asset.storage_key)
        except (FileNotFoundError, ValueError):
            return Response({"detail": "The machine model is unavailable."}, status=404)
        response = HttpResponse(payload, content_type="model/gltf-binary")
        response["Content-Disposition"] = f'inline; filename="{asset.filename}"'
        response["Content-Length"] = str(len(payload))
        response["Cache-Control"] = "private, max-age=3600"
        response["ETag"] = etag
        return response

    def post(self, request, *args, **kwargs):
        machine = self._machine()
        upload = request.FILES.get("file")
        if not upload:
            return Response({"file": "Choose a .glb file."}, status=400)
        if not upload.name.lower().endswith(".glb"):
            return Response({"file": "Only binary .glb files are supported."}, status=400)
        if upload.size > self.MAX_BYTES:
            return Response({"file": "Machine GLB files must be 8 MB or smaller."}, status=400)
        payload = upload.read()
        if len(payload) < 12 or payload[:4] != b"glTF":
            return Response({"file": "The file is not a valid binary glTF container."}, status=400)
        digest = hashlib.sha256(payload).hexdigest()
        key = f"spatial/machines/{machine.id}/{digest}.glb"
        tenant_storage(machine.tenant_id).put(key, payload, content_type="model/gltf-binary")
        asset, _ = MachineModelAsset.objects.update_or_create(
            machine=machine,
            defaults={
                "tenant": machine.tenant,
                "filename": upload.name[:240],
                "storage_key": key,
                "content_type": "model/gltf-binary",
                "size_bytes": len(payload),
                "checksum_sha256": digest,
            },
        )
        return Response(self.get_serializer(asset).data, status=201)

    def delete(self, request, *args, **kwargs):
        machine = self._machine()
        asset = get_object_or_404(MachineModelAsset, machine=machine)
        tenant_storage(machine.tenant_id).delete(asset.storage_key)
        asset.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MachineImageAssetView(generics.GenericAPIView):
    """Upload or stream the compact image shown in a machine map popup."""

    permission_classes = [IsAuthenticated]
    serializer_class = MachineImageAssetSerializer
    MAX_BYTES = 2 * 1024 * 1024

    def get_permissions(self):
        return [CanManageFactory()] if self.request.method == "POST" else [IsAuthenticated()]

    def _machine(self):
        return get_object_or_404(
            SpatialMachine.objects.select_related("layout").filter(
                tenant=tenant_for_request(self.request),
                layout__factory__in=factories_for_request(self.request),
                is_active=True,
            ),
            pk=self.kwargs["machine_id"],
        )

    def get(self, request, *args, **kwargs):
        machine = self._machine()
        asset = get_object_or_404(MachineImageAsset, machine=machine)
        etag = f'"{asset.checksum_sha256}"'
        if request.headers.get("If-None-Match") == etag:
            return HttpResponse(status=304)
        try:
            payload = tenant_storage(machine.tenant_id).get(asset.storage_key)
        except (FileNotFoundError, ValueError):
            return Response({"detail": "The machine image is unavailable."}, status=404)
        response = HttpResponse(payload, content_type=asset.content_type)
        response["Content-Length"] = str(len(payload))
        response["Cache-Control"] = "private, max-age=3600"
        response["ETag"] = etag
        return response

    def post(self, request, *args, **kwargs):
        machine = self._machine()
        upload = request.FILES.get("file")
        if not upload:
            return Response({"file": "Choose a PNG, JPEG or WebP image."}, status=400)
        if upload.size > self.MAX_BYTES:
            return Response({"file": "Machine images must be 2 MB or smaller."}, status=400)
        payload = upload.read()
        if payload.startswith(b"\x89PNG\r\n\x1a\n"):
            content_type, extension = "image/png", "png"
        elif payload.startswith(b"\xff\xd8\xff"):
            content_type, extension = "image/jpeg", "jpg"
        elif len(payload) >= 12 and payload[:4] == b"RIFF" and payload[8:12] == b"WEBP":
            content_type, extension = "image/webp", "webp"
        else:
            return Response(
                {"file": "The file is not a valid PNG, JPEG or WebP image."}, status=400
            )
        digest = hashlib.sha256(payload).hexdigest()
        key = f"spatial/machines/{machine.id}/images/{digest}.{extension}"
        tenant_storage(machine.tenant_id).put(key, payload, content_type=content_type)
        asset, _ = MachineImageAsset.objects.update_or_create(
            machine=machine,
            defaults={
                "tenant": machine.tenant,
                "filename": upload.name[:240],
                "storage_key": key,
                "content_type": content_type,
                "size_bytes": len(payload),
                "checksum_sha256": digest,
            },
        )
        return Response(self.get_serializer(asset).data, status=201)


class MachineEntrySchemaView(generics.RetrieveAPIView):
    """Get data entry field definitions for a specific machine.

    Returns parameters (user-defined fields) plus auto-generated fields
    from inputs and outputs so QR data entry covers all machine data points.
    """

    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant = self.request.user.memberships.first().tenant
        return SpatialMachine.objects.filter(tenant=tenant)

    def retrieve(self, request, *args, **kwargs):
        machine = self.get_object()
        parameters = machine.parameters.filter(is_active=True, origin="manual").order_by("order")
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
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant = self.request.user.memberships.first().tenant
        machine_id = self.kwargs["machine_id"]
        return MachineObservation.objects.filter(tenant=tenant, machine_id=machine_id)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["machine_id"] = self.kwargs.get("machine_id")
        return context

    def perform_create(self, serializer):
        tenant = self.request.user.memberships.first().tenant
        machine_id = self.kwargs["machine_id"]
        observation = serializer.save(
            tenant=tenant,
            machine_id=machine_id,
            submitted_by=self.request.user,
        )
        update_machine_current_state(
            machine=observation.machine,
            observed_at=observation.submitted_at,
            source="manual",
            source_record_id=observation.id,
            values=observation.values,
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
        inventory = InventoryConfiguration.objects.get(tenant=tenant, layout_id=layout_id)
        serializer.save(
            tenant=tenant,
            inventory=inventory,
            submitted_by=self.request.user,
        )


class InventoryDetailView(generics.RetrieveAPIView):
    """Get current inventory state for a layout, including computed stock levels."""

    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant = self.request.user.memberships.first().tenant
        return InventoryConfiguration.objects.filter(tenant=tenant)

    def retrieve(self, request, *args, **kwargs):
        from decimal import Decimal

        from django.db.models import Sum

        tenant = request.user.memberships.first().tenant
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
        dispatch = DispatchConfiguration.objects.get(tenant=tenant, layout_id=layout_id)
        serializer.save(
            tenant=tenant,
            dispatch=dispatch,
            submitted_by=self.request.user,
        )


class DispatchDetailView(generics.RetrieveAPIView):
    """Get current dispatch state for a layout, including computed awaiting quantities."""

    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        tenant = self.request.user.memberships.first().tenant
        return DispatchConfiguration.objects.filter(tenant=tenant)

    def retrieve(self, request, *args, **kwargs):
        from decimal import Decimal

        from django.db.models import Sum

        tenant = request.user.memberships.first().tenant
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
