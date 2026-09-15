import django.db.models.deletion
from django.db import migrations, models


def migrate_references(apps, schema_editor):
    Alert = apps.get_model("alerts", "Alert")
    LegacyLine = apps.get_model("tenancy", "ProductionLine")
    LegacyMachine = apps.get_model("tenancy", "Machine")
    FactoryMaster = apps.get_model("tenancy", "FactoryMaster")
    SpatialMachine = apps.get_model("spatial", "SpatialMachine")

    for line in LegacyLine.objects.all().iterator():
        canonical = FactoryMaster.objects.filter(
            factory_id=line.factory_id, kind="lines", code__iexact=line.code
        ).first()
        if canonical:
            Alert.objects.filter(line_id=line.id).update(canonical_line_id=canonical.id)
    for machine in LegacyMachine.objects.all().iterator():
        canonical = SpatialMachine.objects.filter(
            layout__factory_id=machine.factory_id, code__iexact=machine.code
        ).first()
        if canonical is None:
            matches = SpatialMachine.objects.filter(
                layout__factory_id=machine.factory_id, name__iexact=machine.name
            )
            canonical = matches.first() if matches.count() == 1 else None
        if canonical:
            Alert.objects.filter(machine_id=machine.id).update(canonical_machine_id=canonical.id)


class Migration(migrations.Migration):
    dependencies = [
        ("alerts", "0002_actionitem"),
        ("analytics", "0002_canonical_machine_references"),
    ]
    operations = [
        migrations.AddField(model_name="alert", name="canonical_line", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="+", to="tenancy.factorymaster")),
        migrations.AddField(model_name="alert", name="canonical_machine", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="+", to="spatial.spatialmachine")),
        migrations.RunPython(migrate_references, migrations.RunPython.noop),
        migrations.RemoveField(model_name="alert", name="line"),
        migrations.RemoveField(model_name="alert", name="machine"),
        migrations.RenameField(model_name="alert", old_name="canonical_line", new_name="line"),
        migrations.RenameField(model_name="alert", old_name="canonical_machine", new_name="machine"),
        migrations.AlterField(model_name="alert", name="line", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to="tenancy.factorymaster")),
        migrations.AlterField(model_name="alert", name="machine", field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, to="spatial.spatialmachine")),
    ]
