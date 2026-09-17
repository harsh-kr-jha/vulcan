import json
import uuid

import pytest
from apps.spatial.models import FactoryLayout, SpatialMachine
from apps.streams.admin import machines_for_admin
from apps.streams.models import (
    DatasetExportStatus,
    MachineTelemetrySample,
    TrainingDatasetExport,
)
from apps.tenancy.models import Company, Factory, Tenant
from django.contrib import admin
from django.contrib.auth import get_user_model
from django.test import Client, override_settings
from django.urls import path, reverse
from django.utils import timezone

pytestmark = pytest.mark.django_db
urlpatterns = [path("admin/", admin.site.urls)]


@pytest.fixture
def admin_user():
    return get_user_model().objects.create_superuser(
        username="dataset-admin",
        email="dataset-admin@example.com",
        password="test-password",
    )


@pytest.fixture
def admin_client(admin_user):
    client = Client()
    client.force_login(admin_user)
    return client


@pytest.fixture
def dataset_machine(tenant, factory):
    layout = FactoryLayout.objects.create(
        tenant=tenant,
        factory=factory,
        floor_width=20,
        floor_height=20,
    )
    return SpatialMachine.objects.create(
        tenant=tenant,
        layout=layout,
        name="Press One",
        code="PRESS-01",
        position_x=1,
        position_y=1,
        metadata={"family": "Hydraulic presses"},
    )


@pytest.fixture
def dataset_sample(tenant, dataset_machine):
    return MachineTelemetrySample.objects.create(
        tenant=tenant,
        machine=dataset_machine,
        channel_external_id="press-01",
        schema_version="1",
        event_id=uuid.uuid4(),
        observed_at=timezone.now(),
        sequence_no=1,
        values={"pressure_bar": 42.5},
    )


def test_admin_generates_and_downloads_machine_dataset(
    tmp_path, admin_client, admin_user, dataset_machine, dataset_sample
):
    with override_settings(
        ROOT_URLCONF=__name__,
        ML_DATASETS_ENABLED=True,
        TELEMETRY_STORAGE_BACKEND="filesystem",
        TELEMETRY_STORAGE_ROOT=str(tmp_path),
    ):
        add_url = reverse("admin:streams_trainingdatasetexport_add")
        form_response = admin_client.get(add_url)
        assert form_response.status_code == 200
        assert b"PNQ-01 / PRESS-01" in form_response.content

        response = admin_client.post(
            add_url,
            {
                "machine": str(dataset_machine.pk),
                "level": "machine",
                "version": "1.0.0",
                "_save": "Save",
            },
        )
        assert response.status_code == 302

        export = TrainingDatasetExport.objects.get()
        assert export.status == DatasetExportStatus.READY
        assert export.generated_by == admin_user
        assert export.row_count == 1
        assert export.data_key.startswith("datasets/pnq-01/machine/")

        parquet_response = admin_client.get(
            reverse(
                "admin:streams_trainingdatasetexport_download",
                args=[export.pk, "data"],
            )
        )
        assert parquet_response.status_code == 200
        assert b"".join(parquet_response.streaming_content).startswith(b"PAR1")

        manifest_response = admin_client.get(
            reverse(
                "admin:streams_trainingdatasetexport_download",
                args=[export.pk, "manifest"],
            )
        )
        manifest = json.loads(b"".join(manifest_response.streaming_content))
        assert manifest["factory"] == "PNQ-01"
        assert manifest["target"] == "PRESS-01"


def test_admin_records_a_clear_failure_when_scope_has_no_samples(
    tmp_path, admin_client, dataset_machine
):
    with override_settings(
        ROOT_URLCONF=__name__,
        ML_DATASETS_ENABLED=True,
        TELEMETRY_STORAGE_BACKEND="filesystem",
        TELEMETRY_STORAGE_ROOT=str(tmp_path),
    ):
        response = admin_client.post(
            reverse("admin:streams_trainingdatasetexport_add"),
            {
                "machine": str(dataset_machine.pk),
                "level": "machine",
                "version": "1.0.0",
                "_save": "Save",
            },
        )

    assert response.status_code == 302
    export = TrainingDatasetExport.objects.get()
    assert export.status == DatasetExportStatus.FAILED
    assert export.error == "No telemetry samples were found for this dataset scope."


def test_machine_dropdown_is_limited_to_membership_tenants(
    user, membership, dataset_machine
):
    other_tenant = Tenant.objects.create(name="Other tenant", slug="other")
    other_company = Company.objects.create(tenant=other_tenant, name="Other company")
    other_factory = Factory.objects.create(
        tenant=other_tenant,
        company=other_company,
        name="Other factory",
        code="OTHER-01",
    )
    other_layout = FactoryLayout.objects.create(
        tenant=other_tenant,
        factory=other_factory,
        floor_width=10,
        floor_height=10,
    )
    SpatialMachine.objects.create(
        tenant=other_tenant,
        layout=other_layout,
        name="Hidden machine",
        code="HIDDEN-01",
    )

    assert list(machines_for_admin(user).values_list("pk", flat=True)) == [
        dataset_machine.pk
    ]
