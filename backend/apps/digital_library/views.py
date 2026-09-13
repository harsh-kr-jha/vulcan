from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import TechnicalStandard
from .services import (
    dimension_options,
    dimension_result,
    published_standard,
    rating_options,
    rating_result,
    search_library,
    standard_catalog,
)


class LibraryHomeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        standards = TechnicalStandard.objects.filter(status="published").order_by("code")
        return Response(
            {
                "standards": [
                    {
                        "code": standard.code,
                        "designation": standard.metadata.get("designation", standard.code),
                        "title": standard.title,
                        "edition": standard.edition,
                        "scope": standard.scope,
                        "counts": {
                            "sections": standard.sections.count(),
                            "materials": standard.materials.count(),
                            "ratings": standard.pressure_ratings.count(),
                            "dimensions": standard.dimension_records.count(),
                        },
                    }
                    for standard in standards
                ]
            }
        )


class StandardCatalogView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, code):
        return Response(standard_catalog(resolve_standard(code)))


class LibrarySearchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, code):
        results = search_library(resolve_standard(code), request.query_params.get("q", ""))
        return Response({"results": results})


class RatingExplorerView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, code):
        standard = resolve_standard(code)
        if request.query_params.get("temperature"):
            result = rating_result(standard, request.query_params)
            if result is None:
                raise NotFound("No pressure–temperature rating matches this selection.")
            options = rating_options(standard, request.query_params)
            return Response({"result": result, "options": options})
        return Response({"result": None, "options": rating_options(standard, request.query_params)})


class DimensionExplorerView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, code):
        standard = resolve_standard(code)
        has_selection = all(
            request.query_params.get(key) for key in ("component", "pressure_class", "nps")
        )
        result = dimension_result(standard, request.query_params) if has_selection else None
        if has_selection and result is None:
            raise NotFound("No dimensional record matches this selection.")
        options = dimension_options(standard, request.query_params)
        return Response({"result": result, "options": options})


def resolve_standard(code):
    if len(code) > 80:
        raise ValidationError("Invalid standard code.")
    standard = published_standard(code)
    if standard is None:
        raise NotFound("This technical standard is not published.")
    return standard
