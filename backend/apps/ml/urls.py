from django.urls import path

from apps.ml.views import MachineMLView

urlpatterns = [
    path("machines/<uuid:machine_id>/", MachineMLView.as_view()),
    path("machines/<uuid:machine_id>/<str:action>/", MachineMLView.as_view()),
]
