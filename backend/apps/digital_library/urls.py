from django.urls import path

from .views import (
    DimensionExplorerView,
    LibraryHomeView,
    LibrarySearchView,
    RatingExplorerView,
    StandardCatalogView,
)

urlpatterns = [
    path("", LibraryHomeView.as_view(), name="library-home"),
    path("standards/<str:code>/", StandardCatalogView.as_view(), name="library-standard"),
    path("standards/<str:code>/search/", LibrarySearchView.as_view(), name="library-search"),
    path("standards/<str:code>/ratings/", RatingExplorerView.as_view(), name="library-ratings"),
    path(
        "standards/<str:code>/dimensions/",
        DimensionExplorerView.as_view(),
        name="library-dimensions",
    ),
]
