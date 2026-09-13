import pytest
from apps.digital_library.models import TechnicalStandard
from django.core.management import call_command
from rest_framework.test import APIClient


@pytest.fixture
def library_data(db):
    call_command("seed_technical_library", verbosity=0)
    return TechnicalStandard.objects.get(code="ASME-B16-5")


@pytest.mark.django_db
def test_library_requires_authentication(library_data):
    response = APIClient().get("/api/library/")
    assert response.status_code == 401


@pytest.mark.django_db
def test_catalog_returns_structured_reference_data(api_client, library_data):
    response = api_client.get("/api/library/standards/ASME-B16-5/")
    assert response.status_code == 200
    payload = response.json()
    assert payload["standard"]["designation"] == "ASME B16.5-2017"
    assert payload["counts"] == {
        "sections": 16,
        "components": 8,
        "materials": 5,
        "ratings": 91,
        "dimensions": 90,
        "figures": 6,
    }


@pytest.mark.django_db
def test_pressure_rating_explorer_returns_f316l_rating(api_client, library_data):
    material = library_data.materials.get(grade="F316L")
    response = api_client.get(
        "/api/library/standards/ASME-B16-5/ratings/",
        {
            "material": material.id,
            "pressure_class": 600,
            "temperature": 200,
            "units": "metric",
        },
    )
    assert response.status_code == 200
    result = response.json()["result"]
    assert result["material"]["grade"] == "F316L"
    assert result["maximumAllowablePressure"] == 58.3
    assert result["pressureUnit"] == "bar"
    assert result["source"]["table"] == "2-2.3"


@pytest.mark.django_db
def test_dimension_explorer_returns_component_specific_fields(api_client, library_data):
    response = api_client.get(
        "/api/library/standards/ASME-B16-5/dimensions/",
        {
            "component": "welding-neck",
            "pressure_class": 150,
            "nps": 2,
            "facing": "raised-face",
            "units": "metric",
        },
    )
    assert response.status_code == 200
    result = response.json()["result"]
    fields = {item["key"]: item["value"] for item in result["fields"]}
    assert fields["outsideDiameter"] == 150.0
    assert fields["boltCircle"] == 120.7
    assert fields["bore"] == 52.5
    assert result["figure"]["diagramKind"] == "hub-profile"


@pytest.mark.django_db
def test_search_classifies_material_and_dimension_results(api_client, library_data):
    material_response = api_client.get(
        "/api/library/standards/ASME-B16-5/search/", {"q": "F316L"}
    )
    assert material_response.status_code == 200
    assert material_response.json()["results"][0]["type"] == "material"

    dimension_response = api_client.get(
        "/api/library/standards/ASME-B16-5/search/", {"q": "NPS 12"}
    )
    assert dimension_response.status_code == 200
    assert any(item["type"] == "dimension" for item in dimension_response.json()["results"])

    class_response = api_client.get(
        "/api/library/standards/ASME-B16-5/search/", {"q": "Class 600"}
    )
    assert class_response.status_code == 200
    assert any(item["type"] == "pressure rating" for item in class_response.json()["results"])
