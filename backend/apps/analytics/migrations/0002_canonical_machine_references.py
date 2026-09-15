import re

import django.db.models.deletion
from django.db import migrations, models


def _code(value):
    return re.sub(r"[^A-Za-z0-9]+", "-", str(value or "")).strip("-").upper()[:60]


def migrate_references(apps, schema_editor):
    DailyMetric = apps.get_model("analytics", "DailyMetric")
    LossEvent = apps.get_model("analytics", "LossEvent")
    LegacyLine = apps.get_model("tenancy", "ProductionLine")
    LegacyMachine = apps.get_model("tenancy", "Machine")
    FactoryMaster = apps.get_model("tenancy", "FactoryMaster")
    Layout = apps.get_model("spatial", "FactoryLayout")
    SpatialMachine = apps.get_model("spatial", "SpatialMachine")

    line_map = {}
    for line in LegacyLine.objects.all().iterator():
        canonical, _ = FactoryMaster.objects.get_or_create(
            tenant_id=line.tenant_id,
            factory_id=line.factory_id,
            kind="lines",
            code=line.code,
            defaults={"name": line.name, "is_active": line.is_active},
        )
        line_map[line.id] = canonical.id

    machine_map = {}
    for machine in LegacyMachine.objects.all().iterator():
        layout, _ = Layout.objects.get_or_create(
            tenant_id=machine.tenant_id,
            factory_id=machine.factory_id,
            defaults={"floor_width": 100, "floor_height": 100},
        )
        canonical = SpatialMachine.objects.filter(
            layout=layout, code__iexact=machine.code
        ).first()
        if canonical is None:
            matches = SpatialMachine.objects.filter(layout=layout, name__iexact=machine.name)
            canonical = matches.first() if matches.count() == 1 else None
        if canonical is None:
            base = _code(machine.code) or _code(machine.name) or f"MACHINE-{str(machine.id)[:8]}"
            candidate, suffix = base, 2
            while SpatialMachine.objects.filter(layout=layout, code__iexact=candidate).exists():
                tail = f"-{suffix}"
                candidate = f"{base[:60-len(tail)]}{tail}"
                suffix += 1
            canonical = SpatialMachine.objects.create(
                tenant_id=machine.tenant_id,
                layout=layout,
                code=candidate,
                name=machine.name[:50],
                metadata=machine.metadata or {},
                is_active=machine.is_active,
            )
        machine_map[machine.id] = canonical.id

    for model in (DailyMetric, LossEvent):
        for old_id, new_id in line_map.items():
            model.objects.filter(line_id=old_id).update(canonical_line_id=new_id)
        for old_id, new_id in machine_map.items():
            model.objects.filter(machine_id=old_id).update(canonical_machine_id=new_id)


class Migration(migrations.Migration):
    dependencies = [
        ("analytics", "0001_initial"),
        ("spatial", "0004_canonical_machine_current_state"),
        ("tenancy", "0004_emailidentity"),
    ]
    operations = [
        migrations.AddField(model_name="dailymetric", name="canonical_line", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="+", to="tenancy.factorymaster")),
        migrations.AddField(model_name="dailymetric", name="canonical_machine", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="+", to="spatial.spatialmachine")),
        migrations.AddField(model_name="lossevent", name="canonical_line", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="+", to="tenancy.factorymaster")),
        migrations.AddField(model_name="lossevent", name="canonical_machine", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="+", to="spatial.spatialmachine")),
        migrations.RunPython(migrate_references, migrations.RunPython.noop),
        migrations.RemoveConstraint(model_name="dailymetric", name="unique_daily_metric_grain"),
        migrations.RemoveIndex(model_name="dailymetric", name="analytics_d_tenant__e52ed8_idx"),
        migrations.RemoveField(model_name="dailymetric", name="line"),
        migrations.RemoveField(model_name="dailymetric", name="machine"),
        migrations.RemoveField(model_name="lossevent", name="line"),
        migrations.RemoveField(model_name="lossevent", name="machine"),
        migrations.RenameField(model_name="dailymetric", old_name="canonical_line", new_name="line"),
        migrations.RenameField(model_name="dailymetric", old_name="canonical_machine", new_name="machine"),
        migrations.RenameField(model_name="lossevent", old_name="canonical_line", new_name="line"),
        migrations.RenameField(model_name="lossevent", old_name="canonical_machine", new_name="machine"),
        migrations.AlterField(model_name="dailymetric", name="line", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="daily_metrics", to="tenancy.factorymaster")),
        migrations.AlterField(model_name="dailymetric", name="machine", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="daily_metrics", to="spatial.spatialmachine")),
        migrations.AlterField(model_name="lossevent", name="line", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to="tenancy.factorymaster")),
        migrations.AlterField(model_name="lossevent", name="machine", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to="spatial.spatialmachine")),
        migrations.AddIndex(model_name="dailymetric", index=models.Index(fields=["tenant", "factory", "line", "operational_date"], name="analytics_d_tenant__e52ed8_idx")),
        migrations.AddConstraint(model_name="dailymetric", constraint=models.UniqueConstraint(fields=("tenant", "factory", "line", "machine", "operational_date", "kpi_code", "definition_version"), name="unique_daily_metric_grain")),
    ]
