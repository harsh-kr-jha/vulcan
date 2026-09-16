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
    PredictionModel,
    ProductionProfile,
)
from apps.ml.registry import semantic_version_key
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
        "model_name": s.model.name,
        "model_version": s.model.version,
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
        machine = self.machine(request, machine_id)
        config = ObservationConfig.objects.filter(machine=machine).first()
        profiles = list(
            ProductionProfile.objects.filter(machine=machine)
            .select_related("sku")
            .order_by("-created_at")
        )
        models = list(
            PredictionModel.objects.filter(profile__machine=machine)
            .select_related("profile")
            .order_by("name")[:50]
        )
        models.sort(key=lambda model: semantic_version_key(model.version), reverse=True)
        models.sort(key=lambda model: model.name)
        active = config.active_profile if config else None
        latest = MachineCycle.objects.filter(machine=machine).order_by("-started_at").first()
        state = "Off" if not config or not config.enabled else "Collecting"
        if state != "Off":
            if config.stale_reason:
                state = "Stale"
            elif (
                active
                and PredictionModel.objects.filter(
                    profile__machine=machine,
                    profile__sku=active.sku,
                    profile__contract=active.contract,
                    profile__checkpoint_phase=active.checkpoint_phase,
                    profile__checkpoint_second=active.checkpoint_second,
                    active=True,
                ).exists()
            ):
                state = "Active"
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
                "latest_cycle": cycle_data(latest),
                "outcome_channel": str(binding.channel_id) if binding else None,
                "outcome_error": binding.last_error if binding else "",
                "can_manage": membership_for_request(request).role in MANAGERS,
                "models": [
                    {
                        "id": str(model.id),
                        "profile": str(model.profile_id),
                        "name": model.name,
                        "version": model.version,
                        "runtime": model.runtime,
                        "active": model.active,
                        "selected": bool(
                            model.active
                            and active
                            and model.profile.sku_id == active.sku_id
                            and model.profile.contract == active.contract
                            and model.profile.checkpoint_phase == active.checkpoint_phase
                            and model.profile.checkpoint_second == active.checkpoint_second
                        ),
                        "metrics": model.metrics,
                        "threshold": model.threshold,
                        "source": model.artifact_key.partition(":")[0],
                        "discovered_at": model.updated_at,
                    }
                    for model in models
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
        else:
            raise ValidationError("Unknown ML action.")
        return Response({"ok": True})
