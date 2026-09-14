from django.db import migrations
from django.db.models import Min


def backfill(apps, schema_editor):
    Sample = apps.get_model("streams", "MachineTelemetrySample")
    Cycle = apps.get_model("ml", "MachineCycle")
    for row in Sample.objects.exclude(cycle_id="").exclude(run_id="").values(
        "machine_id", "tenant_id", "run_id", "cycle_id"
    ).annotate(started_at=Min("observed_at")).iterator():
        Cycle.objects.get_or_create(**row, defaults={"completed": True})
    Sample.objects.all().update(observation_processed=True)


class Migration(migrations.Migration):
    dependencies = [("ml", "0001_initial"), ("streams", "0003_machinetelemetrysample_observation_processed")]
    operations = [migrations.RunPython(backfill, migrations.RunPython.noop)]
