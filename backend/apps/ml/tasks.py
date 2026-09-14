from celery import shared_task


@shared_task(queue="machine_learning", ignore_result=True)
def train_model(run_id):
    from apps.ml.training import train

    train(run_id)
