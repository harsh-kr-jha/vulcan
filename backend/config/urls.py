from apps.alerts.views import AlertViewSet
from apps.analytics.views import PerformanceSummaryView
from apps.operations.views import UploadViewSet
from apps.tenancy.views import FactoryViewSet, MeView, SessionLoginView, SessionLogoutView
from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from config.views import HealthView

router = DefaultRouter()
router.register("factories", FactoryViewSet, basename="factory")
router.register("uploads", UploadViewSet, basename="upload")
router.register("alerts", AlertViewSet, basename="alert")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", HealthView.as_view(), name="health"),
    path("api/auth/login/", SessionLoginView.as_view(), name="session-login"),
    path("api/auth/logout/", SessionLogoutView.as_view(), name="session-logout"),
    path("api/auth/me/", MeView.as_view(), name="me"),
    path("api/auth/", include("rest_framework.urls")),
    path("api/performance/summary/", PerformanceSummaryView.as_view(), name="performance-summary"),
    path("api/", include(router.urls)),
]
