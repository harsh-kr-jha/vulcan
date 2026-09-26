from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("streams", "0004_trainingdatasetexport")]

    operations = [
        migrations.AddIndex(
            model_name="machinetelemetrysample",
            index=models.Index(
                fields=[
                    "machine",
                    "stream",
                    "channel_external_id",
                    "run_id",
                    "-sequence_no",
                ],
                name="streams_tel_poll_seq_idx",
            ),
        ),
        migrations.AddIndex(
            model_name="machinetelemetrysample",
            index=models.Index(fields=["received_at"], name="streams_tel_received_idx"),
        ),
    ]
