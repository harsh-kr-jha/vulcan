import math

from django.db import transaction
from django.db.models import Max
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.permissions import (
    factories_for_request,
    membership_for_request,
    tenant_for_request,
)
from apps.ml.engine import feature_fields, field_contract
from apps.ml.models import (
    MachineCycle,
    ObservationConfig,
    OutcomeBinding,
    ProductionProfile,
    TrainingRun,
)
from apps.spatial.models import SpatialMachine
from apps.streams.models import DataStreamChannel, MachineStreamBinding
from apps.tenancy.models import FactoryMaster, Role

MANAGERS = {Role.PLATFORM_ADMIN, Role.COMPANY_ADMIN, Role.FACTORY_ADMIN, Role.FACTORY_MANAGER}


def profile_data(p):
    return {
        "id": str(p.id),
        "sku": str(p.sku_id),
        "sku_name": p.sku.name,
        "version": p.version,
        "ranges": p.ranges,
        "checkpoint_phase": p.checkpoint_phase,
        "checkpoint_second": p.checkpoint_second,
    }


def cycle_data(c):
    if not c:
        return None
    snapshots = sorted(c.snapshots.all(), key=lambda s: s.sequence_no)
    prediction = next((s for s in reversed(snapshots) if s.model_id), None)
    checkpoint = next((s for s in snapshots if s.checkpoint and s.model_id), None)
    return {
        "run_id": c.run_id,
        "cycle_id": c.cycle_id,
        "completed": c.completed,
        "started_at": c.started_at,
        "profile": profile_data(c.profile) if c.profile_id else None,
        "health": c.health,
        "violations": c.violations,
        "prediction": prediction_data(prediction),
        "checkpoint_prediction": prediction_data(checkpoint),
    }


def prediction_data(s):
    if not s:
        return None
    return {
        "model": str(s.model_id),
        "observed_at": s.observed_at,
        "failure_probability": s.failure_probability,
        "label": s.predicted_label,
        "threshold": s.threshold,
    }


class MachineMLView(APIView):
    permission_classes = [IsAuthenticated]

    def machine(self, request, machine_id):
        return get_object_or_404(
            SpatialMachine,
            pk=machine_id,
            tenant=tenant_for_request(request),
            layout__factory__in=factories_for_request(request),
        )

    def get(self, request, machine_id, action="status"):
        from apps.ml.training import eligibility

        machine = self.machine(request, machine_id)
        config = ObservationConfig.objects.filter(machine=machine).first()
        profiles = list(
            ProductionProfile.objects.filter(machine=machine)
            .select_related("sku")
            .order_by("-created_at")
        )
        runs = TrainingRun.objects.filter(profile__machine=machine).order_by("-created_at")[:50]
        active = config.active_profile if config else None
        latest = MachineCycle.objects.filter(machine=machine).order_by("-started_at").first()
        state = "Off" if not config or not config.enabled else "Collecting"
        if state != "Off":
            if config.stale_reason:
                state = "Stale"
            elif (
                active
                and TrainingRun.objects.filter(
                    profile__machine=machine,
                    profile__sku=active.sku,
                    profile__contract=active.contract,
                    profile__checkpoint_phase=active.checkpoint_phase,
                    profile__checkpoint_second=active.checkpoint_second,
                    active=True,
                ).exists()
            ):
                state = "Active"
            elif (
                active
                and TrainingRun.objects.filter(
                    profile__machine=machine,
                    profile__sku=active.sku,
                    profile__contract=active.contract,
                    profile__checkpoint_phase=active.checkpoint_phase,
                    profile__checkpoint_second=active.checkpoint_second,
                    status="candidate",
                ).exists()
            ):
                state = "Candidate ready"
        binding = OutcomeBinding.objects.filter(machine=machine).first()
        stream_binding = (
            MachineStreamBinding.objects.filter(machine=machine)
            .select_related("channel__stream")
            .first()
        )
        return Response(
            {
                "machine": {
                    "id": str(machine.id),
                    "name": machine.name,
                    "status": machine.status,
                    "factory": {
                        "id": str(machine.layout.factory_id),
                        "name": machine.layout.factory.name,
                        "code": machine.layout.factory.code,
                    },
                },
                "input_stream": (
                    {
                        "name": stream_binding.channel.stream.name,
                        "channel": stream_binding.channel.name,
                        "status": stream_binding.status,
                        "last_received_at": stream_binding.last_received_at,
                        "last_error": stream_binding.last_error,
                    }
                    if stream_binding
                    else None
                ),
                "enabled": bool(config and config.enabled),
                "state": state,
                "stale_reason": config.stale_reason if config else "",
                "active_profile": str(config.active_profile_id)
                if config and config.active_profile_id
                else None,
                "pending_profile": str(config.pending_profile_id)
                if config and config.pending_profile_id
                else None,
                "profiles": [profile_data(p) for p in profiles],
                "collection": eligibility(active) if active else None,
                "latest_cycle": cycle_data(latest),
                "outcome_channel": str(binding.channel_id) if binding else None,
                "outcome_error": binding.last_error if binding else "",
                "can_manage": membership_for_request(request).role in MANAGERS,
                "runs": [
                    {
                        "id": str(r.id),
                        "profile": str(r.profile_id),
                        "status": r.status,
                        "active": r.active,
                        "metrics": r.metrics,
                        "error": r.error,
                        "threshold": r.threshold,
                        "created_at": r.created_at,
                        "updated_at": r.updated_at,
                    }
                    for r in runs
                ],
            }
        )

    @transaction.atomic
    def post(self, request, machine_id, action="configuration"):
        machine = self.machine(request, machine_id)
        role = membership_for_request(request).role
        if role not in MANAGERS and not (
            action == "activate" and role == Role.PRODUCTION_SUPERVISOR
        ):
            raise PermissionDenied("Your role cannot change ML configuration.")
        config, _ = ObservationConfig.objects.get_or_create(
            machine=machine, defaults={"tenant": machine.tenant}
        )
        config = ObservationConfig.objects.select_for_update().get(pk=config.pk)
        data = request.data
        if action == "profiles":
            sku = get_object_or_404(
                FactoryMaster,
                pk=data.get("sku"),
                factory=machine.layout.factory,
                kind="skus",
                is_active=True,
            )
            fields = feature_fields(machine)
            numeric = set(
                machine.parameters.filter(is_active=True, data_type="number").values_list(
                    "key", flat=True
                )
            )
            ranges = data.get("ranges", [])
            if not isinstance(ranges, list) or not ranges:
                raise ValidationError("Configure at least one parameter range.")
            for rule in ranges:
                if not isinstance(rule, dict) or rule.get("key") not in numeric:
                    raise ValidationError("Ranges must reference a numeric input parameter.")
                for key in ["min", "max", "weight"]:
                    value = rule.get(key)
                    if (
                        isinstance(value, bool)
                        or not isinstance(value, (int, float))
                        or not math.isfinite(value)
                    ):
                        raise ValidationError("Bounds and weights must be finite numbers.")
                if rule["min"] > rule["max"] or rule["weight"] <= 0:
                    raise ValidationError("Use ordered bounds and positive weights.")
                if (
                    not isinstance(rule.get("phases"), list)
                    or not rule["phases"]
                    or any(not isinstance(p, str) or not p for p in rule["phases"])
                ):
                    raise ValidationError("Select phases for each rule.")
            phase = data.get("checkpoint_phase")
            second = data.get("checkpoint_second")
            if not isinstance(phase, str) or not phase or not isinstance(second, int) or second < 1:
                raise ValidationError("Choose a checkpoint phase and positive phase-second.")
            version = (
                ProductionProfile.objects.filter(machine=machine, sku=sku).aggregate(
                    n=Max("version")
                )["n"]
                or 0
            ) + 1
            profile = ProductionProfile.objects.create(
                tenant=machine.tenant,
                machine=machine,
                sku=sku,
                version=version,
                ranges=ranges,
                fields=fields,
                contract=field_contract(fields),
                checkpoint_phase=phase,
                checkpoint_second=second,
            )
            return Response(profile_data(profile), status=201)
        if action == "activate":
            profile = get_object_or_404(ProductionProfile, pk=data.get("profile"), machine=machine)
            if MachineCycle.objects.filter(machine=machine, completed=False).exists():
                config.pending_profile = profile
            else:
                config.active_profile = profile
                config.pending_profile = None
            config.stale_reason = ""
            config.save()
        elif action == "configuration":
            if not isinstance(data.get("enabled"), bool):
                raise ValidationError("enabled must be boolean.")
            if data["enabled"] and not config.active_profile_id and not config.pending_profile_id:
                raise ValidationError("Activate a production profile first.")
            config.enabled = data["enabled"]
            config.save()
        elif action == "outcome-binding":
            if not data.get("channel"):
                OutcomeBinding.objects.filter(machine=machine).delete()
            else:
                channel = get_object_or_404(
                    DataStreamChannel.objects.select_for_update(),
                    pk=data["channel"],
                    stream__factory=machine.layout.factory,
                )
                if (
                    MachineStreamBinding.objects.filter(channel=channel).exists()
                    or OutcomeBinding.objects.filter(channel=channel)
                    .exclude(machine=machine)
                    .exists()
                ):
                    raise ValidationError("Channel is already assigned.")
                if not any(
                    f.get("semantic") == "quality_outcome"
                    and f.get("data_type") == "selection"
                    and set(f.get("options", [])) == {"good", "failure"}
                    for f in channel.schema.get("fields", [])
                ):
                    raise ValidationError("Choose a quality_outcome selection channel.")
                OutcomeBinding.objects.update_or_create(
                    machine=machine,
                    defaults={
                        "tenant": machine.tenant,
                        "channel": channel,
                        "cursor": channel.latest_cursor,
                    },
                )
        elif action == "train":
            from apps.ml.queue import enqueue
            from apps.ml.training import labeled_cycles, rows_eligibility

            if not config.active_profile:
                raise ValidationError(
                    "Collect 200 labeled cycles, including at least 20 of each class."
                )
            cycle_limit = data.get("cycle_limit")
            if cycle_limit is not None and (
                isinstance(cycle_limit, bool)
                or not isinstance(cycle_limit, int)
                or cycle_limit < 200
            ):
                raise ValidationError("Training data range must contain at least 200 cycles.")
            rows = labeled_cycles(config.active_profile)
            selected_rows = rows[-cycle_limit:] if cycle_limit else rows
            if not rows_eligibility(selected_rows):
                raise ValidationError(
                    "Selected data requires 200 labeled cycles, "
                    "including at least 20 of each class."
                )
            if TrainingRun.objects.filter(
                profile=config.active_profile, status__in=["queued", "training"]
            ).exists():
                raise ValidationError("Training is already queued or running.")
            run = TrainingRun.objects.create(
                tenant=machine.tenant,
                profile=config.active_profile,
                metrics={"requested_cycle_limit": cycle_limit},
            )
            transaction.on_commit(lambda: enqueue(run.id))
        elif action in {"promote", "rollback"}:
            run = get_object_or_404(TrainingRun, pk=data.get("run"), profile__machine=machine)
            if (
                run.status not in {"candidate", "approved"}
                or not config.active_profile
                or run.profile.contract != config.active_profile.contract
                or run.profile.sku_id != config.active_profile.sku_id
                or run.profile.checkpoint_phase != config.active_profile.checkpoint_phase
                or run.profile.checkpoint_second != config.active_profile.checkpoint_second
            ):
                raise ValidationError("Choose a compatible validated model for the active SKU.")
            from apps.ml.training import load_artifact

            load_artifact(run)
            TrainingRun.objects.filter(
                profile__machine=machine, profile__sku=run.profile.sku, active=True
            ).update(active=False)
            run.active = True
            run.status = "approved"
            run.approved_by = request.user
            run.save()
        else:
            raise ValidationError("Unknown ML action.")
        return Response({"ok": True})
