from apps.alerts.views import AlertViewSet
from apps.analytics.views import PerformanceSummaryView
from apps.analytics.workspace_views import (
    WorkspaceActionView,
    WorkspaceConfigurationView,
    WorkspaceQuestionView,
    WorkspaceView,
)
from apps.operations.import_views import (
    ImportCancelView,
    ImportCommitView,
    ImportDeleteView,
    ImportEditView,
    ImportInspectView,
    ImportPreviewView,
    ImportTemplateView,
    ImportValidationView,
)
from apps.operations.views import UploadViewSet
from apps.tenancy.views import (
    CsrfTokenView,
    FactoryMasterViewSet,
    FactoryViewSet,
    MeView,
    SessionLoginView,
    SessionLogoutView,
)
from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from config.views import HealthView

router = DefaultRouter()
router.register("factories", FactoryViewSet, basename="factory")
router.register("factory-masters", FactoryMasterViewSet, basename="factory-master")
router.register("uploads", UploadViewSet, basename="upload")
router.register("alerts", AlertViewSet, basename="alert")

urlpatterns = [
    path("health/", HealthView.as_view(), name="health"),
    path("api/auth/csrf/", CsrfTokenView.as_view(), name="csrf-token"),
    path("api/auth/login/", SessionLoginView.as_view(), name="session-login"),
    path("api/auth/logout/", SessionLogoutView.as_view(), name="session-logout"),
    path("api/auth/me/", MeView.as_view(), name="me"),
    path("api/auth/", include("rest_framework.urls")),
    path("api/performance/summary/", PerformanceSummaryView.as_view(), name="performance-summary"),
    path("api/workspace/", WorkspaceView.as_view(), name="workspace"),
    path(
        "api/workspace/configuration/",
        WorkspaceConfigurationView.as_view(),
        name="workspace-configuration",
    ),
    path("api/workspace/actions/", WorkspaceActionView.as_view(), name="workspace-actions"),
    path(
        "api/workspace/actions/<uuid:action_id>/",
        WorkspaceActionView.as_view(),
        name="workspace-action",
    ),
    path("api/workspace/ask/", WorkspaceQuestionView.as_view(), name="workspace-question"),
    path("api/imports/inspect/", ImportInspectView.as_view(), name="import-inspect"),
    path(
        "api/imports/template/<str:dataset_type>/",
        ImportTemplateView.as_view(),
        name="import-template",
    ),
    path(
        "api/imports/<uuid:upload_id>/validate/",
        ImportValidationView.as_view(),
        name="import-validate",
    ),
    path(
        "api/imports/<uuid:upload_id>/preview/",
        ImportPreviewView.as_view(),
        name="import-preview",
    ),
    path(
        "api/imports/<uuid:upload_id>/edit/",
        ImportEditView.as_view(),
        name="import-edit",
    ),
    path(
        "api/imports/<uuid:upload_id>/delete/",
        ImportDeleteView.as_view(),
        name="import-delete",
    ),
    path("api/imports/<uuid:upload_id>/commit/", ImportCommitView.as_view(), name="import-commit"),
    path("api/imports/<uuid:upload_id>/cancel/", ImportCancelView.as_view(), name="import-cancel"),
    path("api/", include(router.urls)),
]

# The stock admin login is not protected by the API's distributed sign-in
# throttles. Keep it available for loopback-bound local development only and
# omit the route entirely from every fail-closed production configuration.
if settings.DEBUG:
    urlpatterns.insert(0, path("admin/", admin.site.urls))
