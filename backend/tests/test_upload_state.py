import pytest
from apps.operations.models import Upload, UploadState

pytestmark = pytest.mark.django_db


def test_upload_state_machine_allows_expected_transition(user, tenant, factory):
    upload = Upload.objects.create(
        tenant=tenant,
        factory=factory,
        original_filename="production.csv",
        file_type="csv",
        file_size=100,
        template_code="production",
        template_version="3",
        uploaded_by=user,
    )

    upload.transition_to(UploadState.UPLOADING)

    assert upload.status == UploadState.UPLOADING
    assert Upload.objects.get(pk=upload.pk).status == UploadState.UPLOADING


def test_upload_state_machine_rejects_skipped_stage(user, tenant, factory):
    upload = Upload.objects.create(
        tenant=tenant,
        factory=factory,
        original_filename="production.csv",
        file_type="csv",
        file_size=100,
        template_code="production",
        template_version="3",
        uploaded_by=user,
    )

    with pytest.raises(ValueError, match="Cannot transition"):
        upload.transition_to(UploadState.COMPLETED)
