import struct

import pytest
from apps.spatial.models import (
    FactoryLayout,
    FactoryModelAsset,
    MachineImageAsset,
    MachineModelAsset,
    SpatialMachine,
)
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings

pytestmark = pytest.mark.django_db


def minimal_glb():
    json_chunk = b'{"asset":{"version":"2.0"}}'
    json_chunk += b" " * ((4 - len(json_chunk) % 4) % 4)
    length = 12 + 8 + len(json_chunk)
    return (
        b"glTF"
        + struct.pack("<II", 2, length)
        + struct.pack("<I4s", len(json_chunk), b"JSON")
        + json_chunk
    )


def test_upload_and_download_factory_model(api_client, tenant, factory, tmp_path):
    layout = FactoryLayout.objects.create(
        tenant=tenant, factory=factory, floor_width=20, floor_height=10
    )
    url = f"/api/spatial/layouts/{layout.id}/model/"
    with override_settings(TELEMETRY_STORAGE_ROOT=tmp_path):
        response = api_client.post(
            url,
            {"file": SimpleUploadedFile("factory.glb", minimal_glb(), "model/gltf-binary")},
            format="multipart",
        )
        assert response.status_code == 201
        assert response.data["download_url"].startswith(
            f"/api/backend/api/spatial/layouts/{layout.id}/model/"
        )
        assert FactoryModelAsset.objects.filter(layout=layout).exists()
        downloaded = api_client.get(url)
        assert downloaded.status_code == 200
        assert downloaded.content.startswith(b"glTF")
        storage_key = FactoryModelAsset.objects.get(layout=layout).storage_key
        stored_file = tmp_path / "tenants" / str(tenant.id) / storage_key
        assert stored_file.exists()
        deleted = api_client.delete(url)
        assert deleted.status_code == 204
        assert not FactoryModelAsset.objects.filter(layout=layout).exists()
        assert not stored_file.exists()


def test_rejects_non_glb_model(api_client, tenant, factory, tmp_path):
    layout = FactoryLayout.objects.create(
        tenant=tenant, factory=factory, floor_width=20, floor_height=10
    )
    with override_settings(TELEMETRY_STORAGE_ROOT=tmp_path):
        response = api_client.post(
            f"/api/spatial/layouts/{layout.id}/model/",
            {"file": SimpleUploadedFile("factory.txt", b"not a model", "text/plain")},
            format="multipart",
        )
    assert response.status_code == 400


def test_upload_and_download_machine_model(api_client, tenant, factory, tmp_path):
    layout = FactoryLayout.objects.create(
        tenant=tenant, factory=factory, floor_width=20, floor_height=10
    )
    machine = SpatialMachine.objects.create(
        tenant=tenant, layout=layout, name="Press", position_x=1, position_y=1
    )
    url = f"/api/spatial/machines/{machine.id}/model/"
    with override_settings(TELEMETRY_STORAGE_ROOT=tmp_path):
        response = api_client.post(
            url,
            {"file": SimpleUploadedFile("press.glb", minimal_glb(), "model/gltf-binary")},
            format="multipart",
        )
        assert response.status_code == 201
        assert response.data["download_url"].startswith(
            f"/api/backend/api/spatial/machines/{machine.id}/model/"
        )
        assert MachineModelAsset.objects.filter(machine=machine).exists()
        downloaded = api_client.get(url)
        assert downloaded.status_code == 200
        assert downloaded["ETag"]
        assert downloaded.content.startswith(b"glTF")
        storage_key = MachineModelAsset.objects.get(machine=machine).storage_key
        stored_file = tmp_path / "tenants" / str(tenant.id) / storage_key
        assert stored_file.exists()
        deleted = api_client.delete(url)
        assert deleted.status_code == 204
        assert not MachineModelAsset.objects.filter(machine=machine).exists()
        assert not stored_file.exists()


def test_machine_visual_fields_are_serialized(api_client, tenant, factory):
    layout = FactoryLayout.objects.create(
        tenant=tenant, factory=factory, floor_width=20, floor_height=10
    )
    machine = SpatialMachine.objects.create(
        tenant=tenant,
        layout=layout,
        name="Press",
        position_x=1,
        position_y=1,
        representation="glb",
        block_color="#123ABC",
        model_transform={"scale": 1.5, "rotationY": 20, "elevation": 0.4},
    )
    response = api_client.get(f"/api/spatial/layouts/{layout.id}/")
    assert response.status_code == 200
    payload = response.data["machines"][0]
    assert payload["id"] == str(machine.id)
    assert payload["representation"] == "glb"
    assert payload["block_color"] == "#123ABC"
    assert payload["model_transform"]["scale"] == 1.5


def test_upload_and_download_machine_popup_image(api_client, tenant, factory, tmp_path):
    layout = FactoryLayout.objects.create(
        tenant=tenant, factory=factory, floor_width=20, floor_height=10
    )
    machine = SpatialMachine.objects.create(
        tenant=tenant, layout=layout, name="Press", position_x=1, position_y=1
    )
    # Signature validation is intentionally lightweight; browsers decode the image.
    png = b"\x89PNG\r\n\x1a\n" + b"popup-image"
    url = f"/api/spatial/machines/{machine.id}/image/"
    with override_settings(TELEMETRY_STORAGE_ROOT=tmp_path):
        uploaded = api_client.post(
            url,
            {"file": SimpleUploadedFile("press.png", png, "image/png")},
            format="multipart",
        )
        assert uploaded.status_code == 201
        assert uploaded.data["content_type"] == "image/png"
        assert MachineImageAsset.objects.filter(machine=machine).exists()
        downloaded = api_client.get(url)
        assert downloaded.status_code == 200
        assert downloaded["Content-Type"] == "image/png"
        assert downloaded.content == png
        layout_response = api_client.get(f"/api/spatial/layouts/{layout.id}/")
        assert layout_response.data["machines"][0]["image_asset"]["filename"] == "press.png"


def test_rejects_invalid_machine_popup_image(api_client, tenant, factory, tmp_path):
    layout = FactoryLayout.objects.create(
        tenant=tenant, factory=factory, floor_width=20, floor_height=10
    )
    machine = SpatialMachine.objects.create(
        tenant=tenant, layout=layout, name="Press", position_x=1, position_y=1
    )
    with override_settings(TELEMETRY_STORAGE_ROOT=tmp_path):
        response = api_client.post(
            f"/api/spatial/machines/{machine.id}/image/",
            {"file": SimpleUploadedFile("press.svg", b"<svg/>", "image/svg+xml")},
            format="multipart",
        )
    assert response.status_code == 400
