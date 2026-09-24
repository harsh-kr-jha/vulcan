from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("spatial", "0008_duration_aware_status")]

    operations = [
        migrations.AddField(model_name="machineconnection", name="connection_type", field=models.CharField(default="material_transfer", max_length=32)),
        migrations.AddField(model_name="machineconnection", name="direction", field=models.CharField(default="forward", max_length=16)),
        migrations.AddField(model_name="machineconnection", name="geometry", field=models.JSONField(blank=True, default=dict)),
        migrations.AddField(model_name="machineconnection", name="visual_style", field=models.JSONField(blank=True, default=dict)),
    ]
