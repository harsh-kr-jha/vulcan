from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("streams", "0005_ingestion_lookup_indexes")]

    operations = [
        migrations.AddIndex(
            model_name="machinetelemetrysample",
            index=models.Index(
                fields=["machine", "observed_at"], name="streams_tel_machine_obs_idx"
            ),
        ),
    ]
