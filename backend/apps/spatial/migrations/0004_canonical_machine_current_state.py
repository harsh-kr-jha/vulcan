import re
import uuid

import django.db.models.deletion
from django.db import migrations, models
from django.db.models import Q


def _code(value):
    value = re.sub(r"[^A-Za-z0-9]+", "-", str(value or "").strip()).strip("-").upper()
    return value[:60]


def backfill_canonical_machines(apps, schema_editor):
    Layout = apps.get_model("spatial", "FactoryLayout")
    SpatialMachine = apps.get_model("spatial", "SpatialMachine")
    CurrentState = apps.get_model("spatial", "MachineCurrentState")
    FactoryMaster = apps.get_model("tenancy", "FactoryMaster")
    Telemetry = apps.get_model("streams", "MachineTelemetrySample")
    Observation = apps.get_model("spatial", "MachineObservation")

    for layout in Layout.objects.all().iterator():
        used = set()
        spatial = list(SpatialMachine.objects.filter(layout=layout).order_by("created_at"))
        masters = list(
            FactoryMaster.objects.filter(factory_id=layout.factory_id, kind="machines")
            .select_related("parent")
            .order_by("created_at")
        )

        for machine in spatial:
            base = _code(machine.name) or f"MACHINE-{str(machine.id)[:8].upper()}"
            candidate = base
            suffix = 2
            while candidate.casefold() in used:
                tail = f"-{suffix}"
                candidate = f"{base[:60-len(tail)]}{tail}"
                suffix += 1
            machine.code = candidate
            used.add(candidate.casefold())

            matches = [m for m in masters if m.name.strip().casefold() == machine.name.strip().casefold()]
            if len(matches) == 1:
                legacy = matches[0]
                requested = _code(legacy.code)
                if requested and requested.casefold() not in used - {candidate.casefold()}:
                    used.discard(candidate.casefold())
                    machine.code = requested
                    used.add(requested.casefold())
                process_code = str((legacy.metadata or {}).get("processCode", "")).strip()
                if process_code:
                    process = FactoryMaster.objects.filter(
                        factory_id=layout.factory_id,
                        kind="processes",
                        code__iexact=process_code,
                    ).first()
                    machine.process_id = process.id if process else None
                machine.metadata = legacy.metadata or {}
                legacy.metadata = {
                    **(legacy.metadata or {}),
                    "canonicalMachineId": str(machine.id),
                    "migrationOutcome": "matched_unique_name",
                }
                legacy.is_active = False
                legacy.save(update_fields=["metadata", "is_active", "updated_at"])
            machine.save(update_fields=["code", "process", "metadata", "updated_at"])

        for legacy in masters:
            if not legacy.is_active:
                continue
            base = _code(legacy.code) or _code(legacy.name) or f"MACHINE-{str(legacy.id)[:8].upper()}"
            candidate = base
            suffix = 2
            while candidate.casefold() in used:
                tail = f"-{suffix}"
                candidate = f"{base[:60-len(tail)]}{tail}"
                suffix += 1
            process_code = str((legacy.metadata or {}).get("processCode", "")).strip()
            process = FactoryMaster.objects.filter(
                factory_id=layout.factory_id, kind="processes", code__iexact=process_code
            ).first() if process_code else None
            machine = SpatialMachine.objects.create(
                tenant_id=layout.tenant_id,
                layout=layout,
                code=candidate,
                name=legacy.name[:50],
                process_id=process.id if process else None,
                position_x=None,
                position_y=None,
                metadata=legacy.metadata or {},
            )
            used.add(candidate.casefold())
            legacy.metadata = {
                **(legacy.metadata or {}),
                "canonicalMachineId": str(machine.id),
                "migrationOutcome": "created_unplaced",
            }
            legacy.is_active = False
            legacy.save(update_fields=["metadata", "is_active", "updated_at"])

    for machine in SpatialMachine.objects.all().iterator():
        telemetry = Telemetry.objects.filter(machine_id=machine.id).order_by("-observed_at").first()
        manual = Observation.objects.filter(machine_id=machine.id).order_by("-submitted_at").first()
        if telemetry and (not manual or telemetry.observed_at >= manual.submitted_at):
            CurrentState.objects.update_or_create(
                machine_id=machine.id,
                defaults={
                    "tenant_id": machine.tenant_id,
                    "observed_at": telemetry.observed_at,
                    "source": "stream",
                    "source_record_id": telemetry.id,
                    "schema_version": telemetry.schema_version,
                    "run_id": telemetry.run_id,
                    "cycle_id": telemetry.cycle_id,
                    "cycle_number": telemetry.cycle_number,
                    "cycle_phase": telemetry.cycle_phase,
                    "recipe_id": telemetry.recipe_id,
                    "values": telemetry.values,
                },
            )
        elif manual:
            CurrentState.objects.update_or_create(
                machine_id=machine.id,
                defaults={
                    "tenant_id": machine.tenant_id,
                    "observed_at": manual.submitted_at,
                    "source": "manual",
                    "source_record_id": manual.id,
                    "values": manual.values,
                },
            )


class Migration(migrations.Migration):
    dependencies = [
        ("spatial", "0003_machinecustomkpi_disabled_reason_and_more"),
        ("streams", "0003_machinetelemetrysample_observation_processed"),
    ]

    operations = [
        migrations.AddField(
            model_name="spatialmachine",
            name="code",
            field=models.CharField(blank=True, max_length=60),
        ),
        migrations.AddField(
            model_name="spatialmachine",
            name="is_active",
            field=models.BooleanField(default=True),
        ),
        migrations.AddField(
            model_name="spatialmachine",
            name="metadata",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="spatialmachine",
            name="process",
            field=models.ForeignKey(
                blank=True,
                limit_choices_to={"kind": "processes"},
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="spatial_machines",
                to="tenancy.factorymaster",
            ),
        ),
        migrations.AlterField(
            model_name="spatialmachine",
            name="position_x",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="spatialmachine",
            name="position_y",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name="MachineCurrentState",
            fields=[
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("observed_at", models.DateTimeField()),
                ("source", models.CharField(choices=[("stream", "Data stream"), ("manual", "Manual / QR entry")], max_length=20)),
                ("source_record_id", models.UUIDField()),
                ("schema_version", models.CharField(blank=True, max_length=80)),
                ("run_id", models.CharField(blank=True, max_length=100)),
                ("cycle_id", models.CharField(blank=True, max_length=100)),
                ("cycle_number", models.PositiveBigIntegerField(blank=True, null=True)),
                ("cycle_phase", models.CharField(blank=True, max_length=40)),
                ("recipe_id", models.CharField(blank=True, max_length=100)),
                ("values", models.JSONField(default=dict)),
                ("machine", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="current_state", to="spatial.spatialmachine")),
                ("tenant", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, to="tenancy.tenant")),
            ],
        ),
        migrations.RunPython(backfill_canonical_machines, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="spatialmachine",
            constraint=models.UniqueConstraint(condition=~Q(code=""), fields=("layout", "code"), name="unique_spatial_machine_code_per_layout"),
        ),
        migrations.AddIndex(
            model_name="machinecurrentstate",
            index=models.Index(fields=["tenant", "-observed_at"], name="spatial_mac_tenant__824d5a_idx"),
        ),
    ]
