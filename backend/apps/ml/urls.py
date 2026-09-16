from django.urls import path

from apps.ml.views import MachineMLView

urlpatterns = [
    path("machines/<uuid:machine_id>/", MachineMLView.as_view()),
    path(
        "machines/<uuid:machine_id>/configuration/",
        MachineMLView.as_view(),
        {"action": "configuration"},
    ),
    path("machines/<uuid:machine_id>/profiles/", MachineMLView.as_view(), {"action": "profiles"}),
    path("machines/<uuid:machine_id>/activate/", MachineMLView.as_view(), {"action": "activate"}),
    path(
        "machines/<uuid:machine_id>/outcome-binding/",
        MachineMLView.as_view(),
        {"action": "outcome-binding"},
    ),
]
