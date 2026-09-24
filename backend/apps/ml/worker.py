import uuid
from datetime import timedelta
from urllib.parse import quote

from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.ml.engine import observe
from apps.ml.models import (
    FeatureSnapshot,
    MachineCycle,
    ObservationConfig,
    OutcomeBinding,
    OutcomeReceipt,
)
from apps.streams.client import request_json
from apps.streams.models import MachineCycleOutcome, MachineTelemetrySample
from apps.spatial.models import MachineOperationalIssue
from apps.spatial.operational_status import (
    status_visualization_config,
    update_operational_issue,
)


def update_reject_issue(machine, observed_at):
    visualization = status_visualization_config(machine)
    window_size = int(visualization["rejectWindowCycles"])
    minimum = int(visualization["rejectMinimumCycles"])
    outcomes = list(
        MachineCycleOutcome.objects.filter(machine=machine)
        .order_by("-created_at")
        .values_list("effective_label", flat=True)[:window_size]
    )
    rejected = sum(label == "failure" for label in outcomes)
    rate = (100 * rejected / len(outcomes)) if outcomes else 0
    target = float(
        machine.layout.factory.configuration.get("targets", {}).get("rejectionRate", 2)
    )
    update_operational_issue(
        machine=machine,
        issue_type=MachineOperationalIssue.IssueType.HIGH_REJECTS,
        detected=len(outcomes) >= minimum and rate > target,
        observed_at=observed_at,
        evidence={
            "rejectRate": round(rate, 2),
            "targetRate": target,
            "rejected": rejected,
            "sampleSize": len(outcomes),
        },
    )


def poll_outcomes(binding):
    payload = request_json(
        binding.channel.stream,
        f"/v1/channels/{quote(binding.channel.external_id, safe='')}/readings",
        query={"after": binding.cursor, "limit": 500},
    )
    fields = binding.channel.schema.get("fields", [])
    key = next(f["key"] for f in fields if f.get("semantic") == "quality_outcome")
    latest_change = None
    with transaction.atomic():
        for reading in payload.get("readings", []):
            label = reading.get("values", {}).get(key)
            if (
                not reading.get("run_id")
                or not reading.get("cycle_id")
                or label not in {"good", "failure"}
            ):
                raise ValueError("Quality readings require run_id, cycle_id and good/failure.")
            event_id = uuid.UUID(reading["event_id"])
            observed_at = parse_datetime(reading.get("observed_at", ""))
            if observed_at is None or timezone.is_naive(observed_at):
                raise ValueError("Quality reading requires timestamp.")
            _, new_event = OutcomeReceipt.objects.get_or_create(
                event_id=event_id,
                defaults={"tenant": binding.tenant, "binding": binding, "observed_at": observed_at},
            )
            if not new_event:
                continue
            latest_change = max(latest_change, observed_at) if latest_change else observed_at
            outcome, created = MachineCycleOutcome.objects.get_or_create(
                machine=binding.machine,
                run_id=reading["run_id"],
                cycle_id=reading["cycle_id"],
                defaults={
                    "tenant": binding.tenant,
                    "stream": binding.channel.stream,
                    "source_label": label,
                    "effective_label": label,
                },
            )
            previous_time = parse_datetime(outcome.source_metadata.get("quality_observed_at", ""))
            if previous_time and observed_at < previous_time:
                continue
            if not created and outcome.source_label != label:
                outcome.source_label = label
                if not outcome.overridden_by_id:
                    outcome.effective_label = label
                outcome.save()
            outcome.source_metadata = {"quality_observed_at": observed_at.isoformat()}
            outcome.save(update_fields=["source_metadata"])
        binding.cursor = str(payload.get("next_cursor", binding.cursor))
        binding.last_error = ""
        binding.save()
        if latest_change:
            update_reject_issue(binding.machine, latest_change)


def process_pending(limit=500):
    for sample in (
        MachineTelemetrySample.objects.filter(observation_processed=False)
        .select_related("machine__layout__factory", "tenant")
        .order_by("received_at", "sequence_no")[:limit]
    ):
        try:
            observe(sample)
            MachineTelemetrySample.objects.filter(pk=sample.pk).update(observation_processed=True)
            if (
                MachineCycleOutcome.objects.filter(
                    machine=sample.machine, run_id=sample.run_id, cycle_id=sample.cycle_id
                ).exists()
                and not MachineTelemetrySample.objects.filter(
                    machine=sample.machine,
                    run_id=sample.run_id,
                    cycle_id=sample.cycle_id,
                    observation_processed=False,
                ).exists()
            ):
                MachineCycle.objects.filter(
                    machine=sample.machine, run_id=sample.run_id, cycle_id=sample.cycle_id
                ).update(completed=True)
        except Exception as exc:
            ObservationConfig.objects.filter(machine=sample.machine).update(
                stale_reason=str(exc)[:500]
            )
    for binding in OutcomeBinding.objects.filter(channel__stream__enabled=True).select_related(
        "channel__stream__credential", "machine__layout__factory"
    ):
        try:
            poll_outcomes(binding)
        except Exception as exc:
            binding.last_error = str(exc)[:1000]
            binding.save()


def prune_feature_history():
    FeatureSnapshot.objects.filter(created_at__lt=timezone.now() - timedelta(days=365)).delete()
