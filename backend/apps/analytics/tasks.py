from celery import shared_task
from django.db import transaction

from apps.operations.models import Upload, UploadState
from apps.operations.tasks import _complete_job, _start_job


@shared_task(
    bind=True,
    autoretry_for=(OSError, TimeoutError),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=4,
)
def refresh_upload_analytics(self, upload_id: str) -> str:
    with transaction.atomic():
        upload = Upload.objects.select_for_update().get(pk=upload_id)
        job, should_run = _start_job(upload, "analytics")
        if not should_run:
            return "already-completed"
        if upload.status == UploadState.CALCULATING_KPIS:
            upload.transition_to(UploadState.GENERATING_ALERTS)
        # Aggregate and rule evaluation hooks are isolated from the API process.
        upload.transition_to(UploadState.COMPLETED)
        _complete_job(job)
    return upload.status
