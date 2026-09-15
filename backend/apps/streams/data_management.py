import json
from io import BytesIO

from django.db import transaction
from django.db.models import Count, Max, Min, Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_datetime
from openpyxl import Workbook
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import (
    CanApproveUploads,
    CanOperateUploads,
    factories_for_request,
    tenant_for_request,
)
from apps.ml.models import MachineCycle
from apps.spatial.models import MachineCurrentState, MachineObservation, SpatialMachine
from apps.spatial.services import update_machine_current_state
from apps.streams.models import MachineCycleOutcome, MachineTelemetrySample


def _factory(request):
    factory_id = request.query_params.get("factory") or request.data.get("factory")
    return get_object_or_404(
        factories_for_request(request), pk=factory_id
    )


def _machine(request, factory):
    machine_id = request.query_params.get("machine") or request.data.get("machine")
    return get_object_or_404(
        SpatialMachine,
        pk=machine_id,
        tenant=tenant_for_request(request),
        layout__factory=factory,
    )


def _scope_values(request):
    source = request.query_params if request.method == "GET" else request.data
    scope = str(source.get("scope", "machine"))
    if scope not in {"cycle", "cycles", "run", "date_range", "machine"}:
        raise ValueError("Choose cycle, cycles, run, date_range, or machine scope.")
    values = {
        "scope": scope,
        "run_id": str(source.get("run_id", "")),
        "cycle_id": str(source.get("cycle_id", "")),
        "from": str(source.get("from", "")),
        "to": str(source.get("to", "")),
        "cycles": source.get("cycles", []),
    }
    if scope == "cycle" and (not values["run_id"] or not values["cycle_id"]):
        raise ValueError("Cycle scope requires both run_id and cycle_id.")
    if scope == "cycles":
        raw_cycles = values["cycles"]
        if isinstance(raw_cycles, str):
            try:
                raw_cycles = json.loads(raw_cycles)
            except json.JSONDecodeError as exc:
                raise ValueError("Cycles must be a valid list.") from exc
        if not isinstance(raw_cycles, list) or not raw_cycles:
            raise ValueError("Choose at least one cycle.")
        values["cycles"] = [
            (str(item.get("run_id", "")), str(item.get("cycle_id", "")))
            for item in raw_cycles
            if isinstance(item, dict) and item.get("run_id") and item.get("cycle_id")
        ]
        if not values["cycles"]:
            raise ValueError("Choose at least one valid cycle.")
    if scope == "run" and not values["run_id"]:
        raise ValueError("Run scope requires run_id.")
    if scope == "date_range" and not (values["from"] or values["to"]):
        raise ValueError("Date range scope requires a start or end timestamp.")
    return values


def _parse_timestamp(value, label):
    if not value:
        return None
    parsed = parse_datetime(value)
    if parsed is None:
        raise ValueError(f"Enter a valid {label} timestamp.")
    return parsed


def _telemetry_queryset(machine, scope):
    queryset = MachineTelemetrySample.objects.filter(machine=machine)
    if scope["scope"] == "cycle":
        queryset = queryset.filter(run_id=scope["run_id"], cycle_id=scope["cycle_id"])
    elif scope["scope"] == "cycles":
        queryset = queryset.filter(_pair_filter(scope["cycles"]))
    elif scope["scope"] == "run":
        queryset = queryset.filter(run_id=scope["run_id"])
    elif scope["scope"] == "date_range":
        start = _parse_timestamp(scope["from"], "start")
        end = _parse_timestamp(scope["to"], "end")
        if start:
            queryset = queryset.filter(observed_at__gte=start)
        if end:
            queryset = queryset.filter(observed_at__lte=end)
    return queryset


def _pair_filter(rows):
    result = Q(pk__in=[])
    for run_id, cycle_id in rows:
        result |= Q(run_id=run_id, cycle_id=cycle_id)
    return result


def _serialize_sample(sample):
    return {
        "id": str(sample.id),
        "observedAt": sample.observed_at,
        "runId": sample.run_id,
        "cycleId": sample.cycle_id,
        "cycleNumber": sample.cycle_number,
        "phase": sample.cycle_phase,
        "recipe": sample.recipe_id,
        "schemaVersion": sample.schema_version,
        "values": sample.values,
    }


def _restore_current_state(machine):
    MachineCurrentState.objects.filter(machine=machine).delete()
    telemetry = (
        MachineTelemetrySample.objects.filter(machine=machine).order_by("-observed_at").first()
    )
    manual = MachineObservation.objects.filter(machine=machine).order_by("-submitted_at").first()
    if telemetry and (not manual or telemetry.observed_at >= manual.submitted_at):
        update_machine_current_state(
            machine=machine,
            observed_at=telemetry.observed_at,
            source="stream",
            source_record_id=telemetry.id,
            values=telemetry.values,
            schema_version=telemetry.schema_version,
            run_id=telemetry.run_id,
            cycle_id=telemetry.cycle_id,
            cycle_number=telemetry.cycle_number,
            cycle_phase=telemetry.cycle_phase,
            recipe_id=telemetry.recipe_id,
        )
    elif manual:
        update_machine_current_state(
            machine=machine,
            observed_at=manual.submitted_at,
            source="manual",
            source_record_id=manual.id,
            values=manual.values,
        )


class MachineDataManagementView(APIView):
    def get_permissions(self):
        permission = CanApproveUploads if self.request.method == "POST" else CanOperateUploads
        return [permission()]

    def get(self, request):
        factory = _factory(request)
        machines = list(
            SpatialMachine.objects.filter(layout__factory=factory)
            .annotate(
                sample_count=Count("telemetry_samples"),
                first_sample_at=Min("telemetry_samples__observed_at"),
                last_sample_at=Max("telemetry_samples__observed_at"),
            )
            .order_by("display_order", "name")
        )
        selected = next(
            (item for item in machines if str(item.id) == request.query_params.get("machine")),
            machines[0] if machines else None,
        )
        cycles = []
        if selected:
            cycles = list(
                MachineTelemetrySample.objects.filter(machine=selected)
                .exclude(cycle_id="")
                .values("run_id", "cycle_id", "cycle_number", "recipe_id")
                .annotate(
                    sampleCount=Count("id"),
                    startedAt=Min("observed_at"),
                    endedAt=Max("observed_at"),
                )
                .order_by("-endedAt", "-cycle_number")[:200]
            )
        return Response(
            {
                "machines": [
                    {
                        "id": str(item.id),
                        "name": item.name,
                        "code": item.code,
                        "isActive": item.is_active,
                        "sampleCount": item.sample_count,
                        "firstSampleAt": item.first_sample_at,
                        "lastSampleAt": item.last_sample_at,
                    }
                    for item in machines
                ],
                "selectedMachineId": str(selected.id) if selected else None,
                "cycles": cycles,
                "totals": {
                    "machines": len(machines),
                    "samples": sum(item.sample_count for item in machines),
                    "cycles": MachineTelemetrySample.objects.filter(
                        machine__layout__factory=factory
                    )
                    .exclude(cycle_id="")
                    .values("machine_id", "run_id", "cycle_id")
                    .distinct()
                    .count(),
                },
            }
        )

    @transaction.atomic
    def post(self, request):
        factory = _factory(request)
        machine = _machine(request, factory)
        try:
            scope = _scope_values(request)
            telemetry = _telemetry_queryset(machine, scope)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        pairs = set(telemetry.values_list("run_id", "cycle_id"))
        deleted = {"telemetry": telemetry.count(), "outcomes": 0, "mlCycles": 0, "manual": 0}
        telemetry.delete()
        outcome_rows = MachineCycleOutcome.objects.filter(machine=machine)
        cycle_rows = MachineCycle.objects.filter(machine=machine)
        if scope["scope"] == "machine":
            derived_filter = Q()
        elif scope["scope"] == "run":
            derived_filter = Q(run_id=scope["run_id"])
        elif scope["scope"] == "cycle":
            derived_filter = Q(run_id=scope["run_id"], cycle_id=scope["cycle_id"])
        elif scope["scope"] == "cycles":
            derived_filter = _pair_filter(scope["cycles"])
        elif pairs:
            orphaned_pairs = {
                pair
                for pair in pairs
                if not MachineTelemetrySample.objects.filter(
                    machine=machine, run_id=pair[0], cycle_id=pair[1]
                ).exists()
            }
            derived_filter = _pair_filter(orphaned_pairs)
        else:
            derived_filter = Q(pk__in=[])
        outcomes = outcome_rows.filter(derived_filter)
        cycles = cycle_rows.filter(derived_filter)
        deleted["outcomes"] = outcomes.count()
        deleted["mlCycles"] = cycles.count()
        outcomes.delete()
        cycles.delete()
        if scope["scope"] == "machine":
            observations = MachineObservation.objects.filter(machine=machine)
            deleted["manual"] = observations.count()
            observations.delete()
        elif scope["scope"] == "date_range":
            observations = MachineObservation.objects.filter(machine=machine)
            start = _parse_timestamp(scope["from"], "start")
            end = _parse_timestamp(scope["to"], "end")
            if start:
                observations = observations.filter(submitted_at__gte=start)
            if end:
                observations = observations.filter(submitted_at__lte=end)
            deleted["manual"] = observations.count()
            observations.delete()
        _restore_current_state(machine)
        return Response({"deleted": deleted})


class MachineDataPreviewView(APIView):
    permission_classes = [CanOperateUploads]

    def get(self, request):
        factory = _factory(request)
        machine = _machine(request, factory)
        try:
            scope = _scope_values(request)
            queryset = _telemetry_queryset(machine, scope)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        total = queryset.count()
        return Response(
            {
                "machine": {"id": str(machine.id), "name": machine.name, "code": machine.code},
                "scope": scope,
                "totalRows": total,
                "rows": [
                    _serialize_sample(item) for item in queryset.order_by("-observed_at")[:100]
                ],
            }
        )


class MachineDataExportView(APIView):
    permission_classes = [CanOperateUploads]

    def get(self, request):
        factory = _factory(request)
        machine = _machine(request, factory)
        try:
            scope = _scope_values(request)
            queryset = _telemetry_queryset(machine, scope).order_by("observed_at")
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        value_keys = sorted(
            {
                key
                for values in queryset.values_list("values", flat=True).iterator(chunk_size=1000)
                if isinstance(values, dict)
                for key in values
            }
        )
        workbook = Workbook(write_only=True)
        sheet = workbook.create_sheet("Machine data")
        sheet.append(
            [
                "Machine code",
                "Machine name",
                "Observed at",
                "Run ID",
                "Cycle ID",
                "Cycle number",
                "Phase",
                "Recipe",
                "Schema version",
                *value_keys,
            ]
        )
        for sample in queryset.iterator(chunk_size=1000):
            row = [
                machine.code,
                machine.name,
                sample.observed_at.isoformat(),
                sample.run_id,
                sample.cycle_id,
                sample.cycle_number,
                sample.cycle_phase,
                sample.recipe_id,
                sample.schema_version,
            ]
            for key in value_keys:
                value = sample.values.get(key) if isinstance(sample.values, dict) else None
                if isinstance(value, (dict, list)):
                    value = json.dumps(value, separators=(",", ":"))
                if isinstance(value, str) and value.startswith(("=", "+", "-", "@")):
                    value = f"'{value}"
                row.append(value)
            sheet.append(row)
        output = BytesIO()
        workbook.save(output)
        response = HttpResponse(
            output.getvalue(),
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        filename = f"{machine.code or machine.name}-machine-data.xlsx".replace('"', "")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response
