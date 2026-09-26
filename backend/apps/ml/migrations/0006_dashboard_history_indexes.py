from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("ml", "0005_external_prediction_models")]

    operations = [
        migrations.AddIndex(
            model_name="machinecycle",
            index=models.Index(
                fields=["machine", "started_at"], name="ml_cycle_machine_time_idx"
            ),
        ),
        migrations.AddIndex(
            model_name="featuresnapshot",
            index=models.Index(
                fields=["cycle", "-checkpoint", "-sequence_no"],
                name="ml_snapshot_cycle_rank_idx",
            ),
        ),
    ]
