import django.db.models.deletion
import uuid
from django.db import migrations, models

import apps.spatial.models


class Migration(migrations.Migration):
    dependencies = [("spatial", "0007_machine_image_asset")]

    operations = [
        migrations.AddField(
            model_name="factorylayout",
            name="status_visualization",
            field=models.JSONField(
                blank=True, default=apps.spatial.models.default_status_visualization
            ),
        ),
        migrations.AddField(
            model_name="machinecurrentstate",
            name="operating_state",
            field=models.CharField(
                choices=[("running", "Running"), ("inactive", "Inactive"), ("unknown", "Unknown")],
                default="unknown",
                max_length=12,
            ),
        ),
        migrations.AddField(
            model_name="machinecurrentstate",
            name="operating_state_since",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name="MachineOperationalIssue",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("issue_type", models.CharField(choices=[("out_of_range", "Out of range"), ("predicted_failure", "Predicted failure"), ("high_rejects", "High rejects")], max_length=24)),
                ("active", models.BooleanField(default=False)),
                ("candidate_since", models.DateTimeField(blank=True, null=True)),
                ("active_since", models.DateTimeField(blank=True, null=True)),
                ("last_evaluated_at", models.DateTimeField(blank=True, null=True)),
                ("evidence", models.JSONField(blank=True, default=dict)),
                ("machine", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="operational_issues", to="spatial.spatialmachine")),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="tenancy.tenant")),
            ],
        ),
        migrations.AddConstraint(
            model_name="machineoperationalissue",
            constraint=models.UniqueConstraint(fields=("machine", "issue_type"), name="unique_machine_operational_issue"),
        ),
        migrations.AddIndex(
            model_name="machineoperationalissue",
            index=models.Index(fields=["tenant", "machine", "active"], name="spatial_mac_tenant__issue_idx"),
        ),
    ]
