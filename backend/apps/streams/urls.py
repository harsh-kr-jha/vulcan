from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.streams.views import (
    DataInputStreamViewSet,
    MachineCycleHistoryView,
    MachineCycleOutcomeView,
    MachineStreamBindingView,
    MachineStreamSchemaAcceptanceView,
    MachineTelemetryView,
)

router = DefaultRouter()
router.register("", DataInputStreamViewSet, basename="data-stream")

urlpatterns = [
    path("machines/<uuid:machine_id>/binding/", MachineStreamBindingView.as_view()),
    path(
        "machines/<uuid:machine_id>/binding/accept-schema/",
        MachineStreamSchemaAcceptanceView.as_view(),
    ),
    path("machines/<uuid:machine_id>/telemetry/", MachineTelemetryView.as_view()),
    path("machines/<uuid:machine_id>/cycles/", MachineCycleHistoryView.as_view()),
    path(
        "machines/<uuid:machine_id>/outcomes/<uuid:outcome_id>/",
        MachineCycleOutcomeView.as_view(),
    ),
    path("", include(router.urls)),
]
