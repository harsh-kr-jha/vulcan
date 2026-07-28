from celery import shared_task
from django.db import transaction
from django.utils import timezone

from apps.operations.models import ProcessingJob, Upload, UploadState


def _start_job(upload: Upload, stage: str) -> tuple[ProcessingJob, bool]:
    job, created = ProcessingJob.objects.get_or_create(
        tenant=upload.tenant,
        upload=upload,
        stage=stage,
        version=upload.processing_version,
        defaults={"status": "running", "started_at": timezone.now(), "attempt_count": 1},
    )
    if not created and job.status == "completed":
        return job, False
    if not created:
        job.status = "running"
        job.started_at = timezone.now()
        job.attempt_count += 1
        job.error = ""
        job.save(update_fields=["status", "started_at", "attempt_count", "error", "updated_at"])
    return job, True


def _complete_job(job: ProcessingJob) -> None:
    job.status = "completed"
    job.finished_at = timezone.now()
    job.save(update_fields=["status", "finished_at", "updated_at"])


@shared_task(
    bind=True,
    autoretry_for=(OSError, TimeoutError),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=4,
)
def inspect_upload(self, upload_id: str) -> str:
    with transaction.atomic():
        upload = Upload.objects.select_for_update().get(pk=upload_id)
        job, should_run = _start_job(upload, "inspection")
        if not should_run:
            return "already-completed"
        if upload.status == UploadState.QUEUED:
            upload.transition_to(UploadState.INSPECTING)
        # Real readers populate workbook metadata in this isolated worker queue.
        upload.source_sheets = upload.source_sheets or ["Sheet1"]
        upload.save(update_fields=["source_sheets", "updated_at"])
        upload.transition_to(UploadState.MAPPING_REQUIRED)
        _complete_job(job)
    return upload.status


@shared_task(
    bind=True,
    autoretry_for=(OSError, TimeoutError),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=4,
)
def validate_upload(self, upload_id: str) -> str:
    with transaction.atomic():
        upload = Upload.objects.select_for_update().get(pk=upload_id)
        job, should_run = _start_job(upload, "validation")
        if not should_run:
            return "already-completed"
        if upload.status == UploadState.READY_FOR_VALIDATION:
            upload.transition_to(UploadState.VALIDATING)
        upload.transition_to(UploadState.VALIDATION_REVIEW)
        _complete_job(job)
    return upload.status


@shared_task(
    bind=True,
    autoretry_for=(OSError, TimeoutError),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=4,
)
def standardise_upload(self, upload_id: str) -> str:
    from apps.analytics.tasks import refresh_upload_analytics

    with transaction.atomic():
        upload = Upload.objects.select_for_update().get(pk=upload_id)
        job, should_run = _start_job(upload, "standardisation")
        if not should_run:
            return "already-completed"
        if upload.status == UploadState.APPROVED:
            upload.transition_to(UploadState.STANDARDISING)
        upload.transition_to(UploadState.CALCULATING_KPIS)
        _complete_job(job)
    refresh_upload_analytics.delay(upload_id)
    return upload.status
