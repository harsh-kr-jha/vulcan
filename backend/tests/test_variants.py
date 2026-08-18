import pytest
from apps.operations.models import Upload
from apps.tenancy.models import Factory
from config.variants import MANIFESTS, load_variant_manifest
from django.test import Client, override_settings

from processing.templates import templates_for_variant

pytestmark = pytest.mark.django_db


def test_every_allowlisted_variant_manifest_is_valid():
    manifests = {variant: load_variant_manifest(variant) for variant in MANIFESTS}

    assert set(manifests) == {"automotive", "mushroom"}
    assert manifests["automotive"]["features"]["mushroomAnalytics"] is False
    assert manifests["mushroom"]["features"]["mushroomAnalytics"] is True
    assert manifests["automotive"]["datasets"]["production"] == "Production"
    assert manifests["mushroom"]["datasets"]["production"] == "Harvest"
    auto_production = {
        field.key: field.display_name
        for field in templates_for_variant("automotive")["production"]
    }
    mushroom_production = {
        field.key: field.display_name
        for field in templates_for_variant("mushroom")["production"]
    }
    assert auto_production["actual_quantity"] == "Actual quantity"
    assert mushroom_production["actual_quantity"] == "Total harvested kg"
    automotive_fields = [
        field
        for fields in templates_for_variant("automotive").values()
        for field in fields
    ]
    automotive_copy = " ".join(
        text
        for field in automotive_fields
        for text in [field.display_name, *field.aliases]
    ).casefold()
    for mushroom_term in (
        "compost",
        "contamination",
        "crop",
        "cultivation",
        "farm",
        "flush",
        "grower",
        "growing",
        "harvest",
        "mushroom",
        "room",
        "spawn",
        "substrate",
    ):
        assert mushroom_term not in automotive_copy
    assert "flush_number" not in auto_production
    assert "substrate_dry_kg" not in auto_production


def test_platform_config_is_public_non_secret_and_not_cacheable():
    response = Client().get("/api/platform/config/")

    assert response.status_code == 200
    assert response.json()["id"] == "mushroom"
    assert response.json()["features"]["asyncUploads"] is False
    assert "DJANGO_SECRET_KEY" not in response.content.decode()
    assert response["Cache-Control"] == "private, no-store"


@override_settings(
    VULCAN_VARIANT_CONFIG={
        "features": {"asyncUploads": False, "mushroomAnalytics": True}
    }
)
def test_unfinished_async_upload_api_is_disabled(api_client, factory):
    response = api_client.post(
        "/api/uploads/",
        {
            "factory": str(factory.id),
            "original_filename": "large.csv",
            "file_type": "csv",
            "file_size": 100,
            "template_code": "production",
            "template_version": "1",
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "detail": "Asynchronous object uploads are not enabled for this deployment."
    }
    assert Upload.objects.count() == 0


@override_settings(
    VULCAN_VARIANT="automotive",
    VULCAN_VARIANT_CONFIG={
        "industry": "automotive-manufacturing",
        "features": {"asyncUploads": False, "mushroomAnalytics": False},
    },
)
def test_new_factories_are_bound_to_the_deployment_industry(api_client):
    response = api_client.post(
        "/api/factories/",
        {"name": "Chakan Plant", "code": "CHK-01"},
        format="json",
    )

    assert response.status_code == 201
    created = Factory.objects.get(pk=response.data["id"])
    assert created.configuration["industry"] == "automotive-manufacturing"


@override_settings(
    VULCAN_VARIANT="automotive",
    VULCAN_VARIANT_CONFIG={
        "industry": "automotive-manufacturing",
        "features": {"asyncUploads": False, "mushroomAnalytics": False},
    },
)
def test_factory_industry_cannot_cross_the_deployment_variant(api_client, factory):
    response = api_client.patch(
        f"/api/workspace/configuration/?factory={factory.id}",
        {"industry": "mushroom-cultivation"},
        format="json",
    )

    assert response.status_code == 400
    assert response.json() == {
        "detail": "Industry is fixed by this deployment's product variant."
    }
