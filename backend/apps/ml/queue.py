from apps.ml.models import TrainingRun


def enqueue(run_id):
    from django.conf import settings

    # In local/eager mode the dedicated observation command executes queued
    # training runs. Publishing with send_task ignores Celery's eager setting
    # and can otherwise block API requests while it looks for Redis.
    if settings.CELERY_TASK_ALWAYS_EAGER:
        return

    from config.celery import app

    try:
        TrainingRun.objects.filter(pk=run_id, status="queued").update(error="")
        app.send_task(
            "apps.ml.tasks.train_model",
            args=[str(run_id)],
            queue="machine_learning",
            retry=False,
            ignore_result=True,
        )
    except Exception:
        TrainingRun.objects.filter(pk=run_id, status="queued").update(
            error=(
                "The training service is temporarily unavailable. "
                "The request will retry automatically."
            )
        )
