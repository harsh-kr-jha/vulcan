from django.urls import path

from apps.spatial.views import (
    DispatchDetailView,
    DispatchEventListCreateView,
    FactoryLayoutDetailView,
    FactoryLayoutListCreateView,
    InventoryChangeListCreateView,
    InventoryDetailView,
    MachineEntrySchemaView,
    MachineObservationListCreateView,
    SpatialFactoryFeedView,
)

app_name = "spatial"

urlpatterns = [
    path(
        "feed/",
        SpatialFactoryFeedView.as_view(),
        name="spatial-feed",
    ),
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
        InventoryChangeListCreateView.as_view(),
        name="inventory-changes",
    ),
    path(
        "inventory/<uuid:layout_id>/",
        InventoryDetailView.as_view(),
        name="inventory-detail",
    ),
    path(
        "dispatch/<uuid:layout_id>/events/",
        DispatchEventListCreateView.as_view(),
        name="dispatch-events",
    ),
    path(
        "dispatch/<uuid:layout_id>/",
        DispatchDetailView.as_view(),
        name="dispatch-detail",
    ),
]
