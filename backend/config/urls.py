from apps.alerts.views import AlertViewSet
from apps.analytics.workspace_views import (
    LiveDashboardView,
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
from apps.streams.data_management import (
    MachineDataExportView,
    MachineDataManagementView,
    MachineDataPreviewView,
)
from apps.tenancy.views import (
    CsrfTokenView,
    FactoryMasterImportApplyView,
    FactoryMasterImportInspectView,
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

from config.views import HealthView, PlatformConfigView

router = DefaultRouter()
router.register("factories", FactoryViewSet, basename="factory")
router.register("factory-masters", FactoryMasterViewSet, basename="factory-master")
router.register("uploads", UploadViewSet, basename="upload")
router.register("alerts", AlertViewSet, basename="alert")

urlpatterns = [
    path("api/ml/", include("apps.ml.urls")),
    path("health/", HealthView.as_view(), name="health"),
    path("api/platform/config/", PlatformConfigView.as_view(), name="platform-config"),
    path("api/auth/csrf/", CsrfTokenView.as_view(), name="csrf-token"),
    path("api/auth/login/", SessionLoginView.as_view(), name="session-login"),
    path("api/auth/logout/", SessionLogoutView.as_view(), name="session-logout"),
    path("api/auth/me/", MeView.as_view(), name="me"),
    path("api/auth/", include("rest_framework.urls")),
    path("api/workspace/", WorkspaceView.as_view(), name="workspace"),
    path("api/dashboard/live/", LiveDashboardView.as_view(), name="live-dashboard"),
    path("api/data-management/", MachineDataManagementView.as_view(), name="data-management"),
    path(
        "api/data-management/preview/",
        MachineDataPreviewView.as_view(),
        name="data-management-preview",
    ),
    path(
        "api/data-management/export/",
        MachineDataExportView.as_view(),
        name="data-management-export",
    ),
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
        "api/factory-masters/import/inspect/",
        FactoryMasterImportInspectView.as_view(),
        name="factory-master-import-inspect",
    ),
    path(
        "api/factory-masters/import/apply/",
        FactoryMasterImportApplyView.as_view(),
        name="factory-master-import-apply",
    ),
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
    path("api/spatial/", include("apps.spatial.urls")),
    path("api/data-streams/", include("apps.streams.urls")),
    path("api/", include(router.urls)),
]

# Production admin remains absent by default. Any explicitly configured deployment
# can opt in so its operator can manage that variant's users and data.
if settings.DEBUG or settings.ADMIN_ENABLED:
    from apps.tenancy.admin import configure_vulcan_user_admin

    configure_vulcan_user_admin()
    if settings.ADMIN_ENABLED and not settings.DEBUG:
        admin.site.site_header = "Tamaso Platform Administration"
        admin.site.site_title = "Tamaso Admin"
        admin.site.index_title = "Platform deployment"
    urlpatterns.insert(0, path("admin/", admin.site.urls))
