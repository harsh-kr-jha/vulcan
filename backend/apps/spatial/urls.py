from django.urls import path

from apps.spatial.views import (
    DispatchDetailView,
    DispatchEventCreateView,
    FactoryLayoutDetailView,
    FactoryLayoutListCreateView,
    FactoryModelAssetView,
    InventoryChangeCreateView,
    InventoryDetailView,
    MachineEntrySchemaView,
    MachineImageAssetView,
    MachineModelAssetView,
    MachineObservationListCreateView,
)

app_name = "spatial"

urlpatterns = [
    path(
        "layouts/",
        FactoryLayoutListCreateView.as_view(),
        name="layout-list-create",
    ),
    path(
        "layouts/<uuid:pk>/",
        FactoryLayoutDetailView.as_view(),
        name="layout-detail",
    ),
    path(
        "layouts/<uuid:layout_id>/model/",
        FactoryModelAssetView.as_view(),
        name="layout-model",
    ),
    path(
        "machines/<uuid:machine_id>/image/",
        MachineImageAssetView.as_view(),
        name="machine-image",
    ),
    path(
        "machines/<uuid:machine_id>/model/",
        MachineModelAssetView.as_view(),
        name="machine-model",
    ),
    path(
        "machines/<uuid:pk>/entry-schema/",
        MachineEntrySchemaView.as_view(),
        name="machine-entry-schema",
    ),
    path(
        "machines/<uuid:machine_id>/observations/",
        MachineObservationListCreateView.as_view(),
        name="machine-observations",
    ),
    path(
        "inventory/<uuid:layout_id>/changes/",
        InventoryChangeCreateView.as_view(),
        name="inventory-changes",
    ),
    path(
        "inventory/<uuid:layout_id>/",
        InventoryDetailView.as_view(),
        name="inventory-detail",
    ),
    path(
        "dispatch/<uuid:layout_id>/events/",
        DispatchEventCreateView.as_view(),
        name="dispatch-events",
    ),
    path(
        "dispatch/<uuid:layout_id>/",
        DispatchDetailView.as_view(),
        name="dispatch-detail",
    ),
]
