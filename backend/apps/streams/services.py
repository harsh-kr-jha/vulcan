import re
import uuid
from datetime import timedelta
from urllib.parse import quote

from django.conf import settings
from django.db import transaction
from django.db.models import Max
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.spatial.models import MachineParameter, ParamDataType
from apps.spatial.services import update_machine_current_state
from apps.streams.client import StreamClientError, request_json, valid_control_action
from apps.streams.models import (
    BindingStatus,
    DataInputStream,
    DataStreamChannel,
    DataStreamSchemaVersion,
    MachineCycleOutcome,
    MachineStreamBinding,
    MachineTelemetrySample,
    StreamStatus,
)

SUPPORTED_TYPES = {choice for choice, _ in ParamDataType.choices}


def _kpi_uses_parameter(kpi, parameter_key: str) -> bool:
    operations = kpi.formula.get("operations", []) if isinstance(kpi.formula, dict) else []
    return any(
        isinstance(operation, dict) and operation.get("parameterKey") == parameter_key
        for operation in operations
    )


def _disable_affected_kpis(machine, parameter_key: str, reason: str):
    for kpi in machine.custom_kpis.filter(is_enabled=True):
        if _kpi_uses_parameter(kpi, parameter_key):
            kpi.is_enabled = False
            kpi.disabled_reason = reason
            kpi.save(update_fields=["is_enabled", "disabled_reason"])


def discover_stream(stream: DataInputStream):
    manifest = request_json(stream, "/v1/manifest")
    if manifest.get("protocol") != "http-pull-v1":
        raise StreamClientError("The source does not implement http-pull-v1.")
    if manifest.get("simulated") is True and not settings.TELEMETRY_ALLOW_SIMULATED_INPUTS:
        raise StreamClientError("Simulated stream inputs are disabled in this deployment.")
    raw_channels = manifest.get("channels")
    if not isinstance(raw_channels, list):
        raise StreamClientError("The source manifest has no channel list.")
    capabilities = manifest.get("capabilities", {})
    if not isinstance(capabilities, dict) or not isinstance(capabilities.get("controls", []), list):
        raise StreamClientError("The source manifest has invalid capabilities.")
    controls = []
    for control in capabilities.get("controls", []):
        if not isinstance(control, dict):
            continue
        action = str(control.get("id", ""))
        if not valid_control_action(action):
            continue
        controls.append(
            {
                "id": action,
                "label": str(control.get("label") or action),
                "inputs": [str(value) for value in control.get("inputs", [])]
                if isinstance(control.get("inputs", []), list)
                else [],
            }
        )
    capabilities = {**capabilities, "controls": controls}
    with transaction.atomic():
        seen = set()
        for item in raw_channels:
            if not isinstance(item, dict):
                raise StreamClientError("The source manifest contains an invalid channel.")
            external_id = str(item.get("id", "")).strip()
            if not external_id:
                continue
            schema = request_json(stream, f"/v1/channels/{quote(external_id, safe='')}/schema")
            version = str(schema.get("schema_version", "")).strip()
            if not version:
                raise StreamClientError("A channel schema did not include a schema version.")
            schema_fields(schema)
            channel = DataStreamChannel.objects.filter(
                stream=stream, external_id=external_id
            ).first()
            snapshot = DataStreamSchemaVersion.objects.filter(
                channel=channel, version=version
            ).first()
            if snapshot and snapshot.schema.get("fields") != schema.get("fields"):
                raise StreamClientError(
                    f"Channel {external_id} changed schema without changing its version."
                )
            old_schema = channel.schema if channel else {}
            if channel is None:
                channel = DataStreamChannel.objects.create(
                    tenant=stream.tenant,
                    stream=stream,
                    external_id=external_id,
                    name=str(item.get("name") or external_id),
                    schema_version=version,
                    schema=schema,
                    latest_cursor=str(schema.get("latest_cursor", "")),
                )
            else:
                try:
                    binding = channel.machine_binding
                except MachineStreamBinding.DoesNotExist:
                    binding = None
                incompatible = _incompatible_field_keys(old_schema, schema) if binding else []
                if incompatible:
                    binding.status = BindingStatus.SCHEMA_REVIEW
                    binding.last_error = (
                        f"Schema review required for: {', '.join(sorted(incompatible))}."
                    )
                    binding.save(update_fields=["status", "last_error", "updated_at"])
                    channel.name = str(item.get("name") or external_id)
                    channel.active = True
                    channel.save(update_fields=["name", "active", "updated_at"])
                else:
                    channel.name = str(item.get("name") or external_id)
                    channel.schema_version = version
                    channel.schema = schema
                    channel.latest_cursor = str(schema.get("latest_cursor", ""))
                    channel.active = True
                    channel.save()
                    if binding and (
                        old_schema.get("fields") != schema.get("fields")
                        or old_schema.get("schema_version") != schema.get("schema_version")
                    ):
                        new_keys = {field["key"] for field in schema_fields(schema)}
                        MachineParameter.objects.filter(
                            machine=binding.machine, origin="stream"
                        ).exclude(key__in=new_keys).update(is_active=False)
                        bind_machine(binding.machine, channel)
            DataStreamSchemaVersion.objects.get_or_create(
                tenant=stream.tenant,
                channel=channel,
                version=version,
                defaults={"schema": schema},
            )
            seen.add(external_id)
        removed_channels = stream.channels.exclude(external_id__in=seen)
        MachineStreamBinding.objects.filter(channel__in=removed_channels).update(
            status=BindingStatus.PAUSED,
            last_error="The source no longer advertises this channel.",
        )
        removed_channels.update(active=False)
        stream.capabilities = capabilities
        existing_metadata = (
            stream.source_metadata if isinstance(stream.source_metadata, dict) else {}
        )
        stream.source_metadata = {
            **existing_metadata,
            "source_id": manifest.get("source_id", ""),
            "name": manifest.get("name", stream.name),
            "version": manifest.get("version", ""),
        }
        stream.status = StreamStatus.CONNECTED
        stream.last_success_at = timezone.now()
        stream.last_error = ""
        stream.save(
            update_fields=[
                "capabilities",
                "source_metadata",
                "status",
                "last_success_at",
                "last_error",
                "updated_at",
            ]
        )
    return manifest


def schema_fields(schema: dict) -> list[dict]:
    fields = schema.get("fields", [])
    if not isinstance(fields, list) or not fields:
        raise StreamClientError("The selected channel has no field schema.")
    keys = set()
    cleaned = []
    for index, field in enumerate(fields):
        if not isinstance(field, dict):
            raise StreamClientError("The channel schema contains an invalid field definition.")
        key = str(field.get("key", "")).strip()
        data_type = str(field.get("data_type", "")).strip()
        try:
            order = int(field.get("order", index))
        except (TypeError, ValueError) as exc:
            raise StreamClientError("A channel field has an invalid order.") from exc
        options = field.get("options", [])
        if (
            not re.fullmatch(r"[A-Za-z0-9_]{1,64}", key)
            or key in keys
            or data_type not in SUPPORTED_TYPES
            or order < 0
            or not isinstance(options, list)
        ):
            raise StreamClientError(
                "The selected channel contains an invalid or duplicate field definition."
            )
        keys.add(key)
        cleaned.append(
            {
                "key": key,
                "label": str(field.get("label") or key),
                "data_type": data_type,
                "unit": str(field.get("unit") or ""),
                "semantic": str(field.get("semantic") or "measurement"),
                "required": bool(field.get("required", True)),
                "order": order,
                "source_field_id": str(field.get("id") or key),
                "options": [str(option) for option in options] if data_type == "selection" else [],
            }
        )
    return cleaned


def _incompatible_field_keys(old_schema: dict, new_schema: dict) -> list[str]:
    old_fields = {item["key"]: item for item in schema_fields(old_schema)}
    new_fields = {item["key"]: item for item in schema_fields(new_schema)}
    return [
        key
        for key in new_fields.keys() & old_fields.keys()
        if (new_fields[key]["data_type"], new_fields[key]["unit"])
        != (old_fields[key]["data_type"], old_fields[key]["unit"])
    ]


@transaction.atomic
def bind_machine(machine, channel: DataStreamChannel | None, *, refresh_source=False):
    from apps.ml.models import OutcomeBinding

    if channel is not None:
        DataStreamChannel.objects.select_for_update().get(pk=channel.pk)
    if channel is not None and OutcomeBinding.objects.filter(channel=channel).exists():
        raise StreamClientError("This channel is assigned as a quality outcome source.")
    existing = MachineStreamBinding.objects.select_for_update().filter(machine=machine).first()
    if channel is None:
        if existing:
            MachineParameter.objects.filter(machine=machine, origin="stream").delete()
            existing.delete()
        return None
    if (
        channel.stream.factory_id != machine.layout.factory_id
        or channel.tenant_id != machine.tenant_id
    ):
        raise StreamClientError("The stream channel and machine must belong to the same factory.")
    occupied = (
        MachineStreamBinding.objects.filter(channel=channel).exclude(machine=machine).exists()
    )
    if occupied:
        raise StreamClientError("This stream channel is already assigned to another machine.")
    switching_channels = bool(existing and existing.channel_id != channel.id)
    if refresh_source and (not existing or switching_channels):
        current_schema = request_json(
            channel.stream,
            f"/v1/channels/{quote(channel.external_id, safe='')}/schema",
        )
        version = str(current_schema.get("schema_version", "")).strip()
        if not version:
            raise StreamClientError("The selected channel schema has no version.")
        schema_fields(current_schema)
        channel.schema = current_schema
        channel.schema_version = version
        channel.latest_cursor = str(current_schema.get("latest_cursor", ""))
        channel.save(update_fields=["schema", "schema_version", "latest_cursor", "updated_at"])
        DataStreamSchemaVersion.objects.get_or_create(
            tenant=channel.tenant,
            channel=channel,
            version=version,
            defaults={"schema": current_schema},
        )
    fields = schema_fields(channel.schema)
    if switching_channels:
        MachineParameter.objects.filter(machine=machine, origin="stream").delete()
    for field in fields:
        param = MachineParameter.objects.filter(machine=machine, key__iexact=field["key"]).first()
        values = {
            "key": field["key"],
            "label": field["label"],
            "data_type": field["data_type"],
            "unit": field["unit"],
            "semantic": field["semantic"],
            "required": field["required"],
            "order": field["order"],
            "origin": "stream",
            "source_field_id": field["source_field_id"],
            "source_schema_version": channel.schema_version,
            "is_active": True,
            "options": field["options"],
        }
        if param:
            old_type = param.data_type
            for key, value in values.items():
                setattr(param, key, value)
            param.save()
            if old_type != param.data_type:
                _disable_affected_kpis(
                    machine,
                    param.key,
                    f"Disabled because stream field {param.key} changed type "
                    f"from {old_type} to {param.data_type}.",
                )
        else:
            MachineParameter.objects.create(machine=machine, **values)
    if existing:
        existing.channel = channel
        if switching_channels:
            existing.cursor = channel.latest_cursor
        existing.status = BindingStatus.ACTIVE
        existing.last_error = ""
        existing.consecutive_failures = 0
        existing.next_poll_at = timezone.now()
        existing.save()
        return existing
    return MachineStreamBinding.objects.create(
        tenant=machine.tenant,
        machine=machine,
        channel=channel,
        cursor=channel.latest_cursor,
        next_poll_at=timezone.now(),
    )


def _validate_reading(reading, fields):
    try:
        event_id = uuid.UUID(str(reading["event_id"]))
        observed_at = parse_datetime(str(reading["observed_at"]))
        sequence_no = int(reading["sequence_no"])
    except (KeyError, TypeError, ValueError) as exc:
        raise StreamClientError(
            "A reading has invalid identity, timestamp, or sequence data."
        ) from exc
    if (
        observed_at is None
        or observed_at > timezone.now() + timedelta(minutes=5)
        or sequence_no < 0
    ):
        raise StreamClientError("A reading timestamp or sequence number is invalid.")
    values = reading.get("values")
    if not isinstance(values, dict):
        raise StreamClientError("A reading values member must be an object.")
    for field in fields:
        if field["required"] and field["key"] not in values:
            raise StreamClientError(f"A reading is missing required field {field['key']}.")
        value = values.get(field["key"])
        if (
            value is not None
            and field["data_type"] == "number"
            and (isinstance(value, bool) or not isinstance(value, (int, float)))
        ):
            raise StreamClientError(f"Field {field['key']} must be numeric.")
        if value is not None and field["data_type"] == "text" and not isinstance(value, str):
            raise StreamClientError(f"Field {field['key']} must be text.")
        if value is not None and field["data_type"] == "boolean" and not isinstance(value, bool):
            raise StreamClientError(f"Field {field['key']} must be boolean.")
        if (
            value is not None
            and field["data_type"] == "selection"
            and value not in field["options"]
        ):
            raise StreamClientError(f"Field {field['key']} is not an allowed selection.")
    return event_id, observed_at, sequence_no, values


def poll_binding(binding: MachineStreamBinding):
    channel = binding.channel
    payload = request_json(
        channel.stream,
        f"/v1/channels/{quote(channel.external_id, safe='')}/readings",
        query={"after": binding.cursor, "limit": 500},
    )
    readings = payload.get("readings", [])
    if not isinstance(readings, list):
        raise StreamClientError("The stream returned an invalid readings list.")
    response_schema = str(payload.get("schema_version") or channel.schema_version)
    if response_schema != channel.schema_version:
        return refresh_binding_schema(binding)
    fields = schema_fields(channel.schema)
    samples = []
    outcomes = []
    batch_sequences: dict[str, int] = {}
    batch_event_ids = set()
    last_sequences = {
        item["run_id"]: item["maximum"]
        for item in (
            MachineTelemetrySample.objects.filter(
                machine=binding.machine,
                stream=channel.stream,
                channel_external_id=channel.external_id,
            )
            .values("run_id")
            .annotate(maximum=Max("sequence_no"))
        )
    }
    for reading in readings:
        event_id, observed_at, sequence_no, values = _validate_reading(reading, fields)
        if event_id in batch_event_ids:
            continue
        batch_event_ids.add(event_id)
        run_id = str(reading.get("run_id", ""))
        previous_sequence = batch_sequences.get(run_id)
        if previous_sequence is not None and sequence_no < previous_sequence:
            raise StreamClientError("The stream returned readings out of sequence.")
        if previous_sequence is not None and sequence_no == previous_sequence:
            # Some gateways can replay the final sample while recovering from a
            # crash. Keep the first event for that sequence and advance the
            # opaque cursor so one bad replay cannot permanently block a channel.
            continue
        batch_sequences[run_id] = sequence_no
        last_sequence = last_sequences.get(run_id)
        if last_sequence is not None and sequence_no == last_sequence:
            continue
        if last_sequence is not None and sequence_no < last_sequence:
            if MachineTelemetrySample.objects.filter(event_id=event_id).exists():
                continue
            raise StreamClientError("The stream returned an out-of-order reading.")
        samples.append(
            MachineTelemetrySample(
                tenant=binding.tenant,
                machine=binding.machine,
                stream=channel.stream,
                channel_external_id=channel.external_id,
                schema_version=response_schema,
                event_id=event_id,
                observed_at=observed_at,
                sequence_no=sequence_no,
                run_id=run_id,
                cycle_id=str(reading.get("cycle_id", "")),
                cycle_number=reading.get("cycle_number"),
                cycle_phase=str(reading.get("cycle_phase", "")),
                recipe_id=str(reading.get("recipe_id", "")),
                values=values,
            )
        )
        raw_outcome = reading.get("outcome")
        cycle_id = str(reading.get("cycle_id", ""))
        if raw_outcome is not None:
            if not isinstance(raw_outcome, dict) or not cycle_id:
                raise StreamClientError("The stream returned an invalid cycle outcome.")
            source_label = str(raw_outcome.get("splice_result", ""))
            if source_label not in {"good", "failure"}:
                raise StreamClientError("The stream returned an invalid splice result.")
            quality_score = raw_outcome.get("quality_score")
            if quality_score is not None:
                if isinstance(quality_score, bool) or not isinstance(quality_score, (int, float)):
                    raise StreamClientError("The stream returned an invalid quality score.")
                quality_score = float(quality_score)
                if not 0 <= quality_score <= 1:
                    raise StreamClientError("The stream returned an invalid quality score.")
            outcomes.append(
                {
                    "run_id": run_id,
                    "cycle_id": cycle_id,
                    "cycle_number": reading.get("cycle_number"),
                    "source_label": source_label,
                    "quality_score": quality_score,
                    "failure_mode": str(raw_outcome.get("failure_mode", ""))[:100],
                    "sensor_data_quality": str(raw_outcome.get("sensor_data_quality", ""))[:30],
                    "source_metadata": raw_outcome,
                }
            )
    now = timezone.now()
    existing_event_ids = set(
        MachineTelemetrySample.objects.filter(
            event_id__in=[sample.event_id for sample in samples]
        ).values_list("event_id", flat=True)
    )
    persisted_samples = [
        sample for sample in samples if sample.event_id not in existing_event_ids
    ]
    with transaction.atomic():
        MachineTelemetrySample.objects.bulk_create(persisted_samples, ignore_conflicts=True)
        if persisted_samples:
            latest_sample = max(persisted_samples, key=lambda item: item.observed_at)
            update_machine_current_state(
                machine=binding.machine,
                observed_at=latest_sample.observed_at,
                source="stream",
                source_record_id=latest_sample.id,
                values=latest_sample.values,
                schema_version=latest_sample.schema_version,
                run_id=latest_sample.run_id,
                cycle_id=latest_sample.cycle_id,
                cycle_number=latest_sample.cycle_number,
                cycle_phase=latest_sample.cycle_phase,
                recipe_id=latest_sample.recipe_id,
            )
        for outcome_data in outcomes:
            outcome, created = MachineCycleOutcome.objects.get_or_create(
                tenant=binding.tenant,
                machine=binding.machine,
                run_id=outcome_data["run_id"],
                cycle_id=outcome_data["cycle_id"],
                defaults={
                    "stream": channel.stream,
                    "effective_label": outcome_data["source_label"],
                    **outcome_data,
                },
            )
            if not created:
                for field, value in outcome_data.items():
                    setattr(outcome, field, value)
                outcome.stream = channel.stream
                update_fields = [
                    "stream",
                    *outcome_data.keys(),
                    "updated_at",
                ]
                if outcome.overridden_by_id is None:
                    outcome.effective_label = outcome_data["source_label"]
                    update_fields.append("effective_label")
                outcome.save(update_fields=update_fields)
        binding = MachineStreamBinding.objects.select_for_update().get(pk=binding.pk)
        binding.cursor = str(payload.get("next_cursor", binding.cursor))
        binding.last_polled_at = now
        if readings:
            binding.last_received_at = now
        binding.next_poll_at = now + timedelta(seconds=binding.channel.stream.poll_interval_seconds)
        binding.status = BindingStatus.ACTIVE
        binding.consecutive_failures = 0
        binding.last_error = ""
        binding.save()
        channel.latest_cursor = binding.cursor
        channel.save(update_fields=["latest_cursor", "updated_at"])
        stream = channel.stream
        stream.last_success_at = now
        stream.status = StreamStatus.CONNECTED
        stream.last_error = ""
        stream.save(update_fields=["last_success_at", "status", "last_error", "updated_at"])
    # PostgreSQL is the ingestion control plane. Optional data-plane failures
    # are retried and durably spooled without rolling back accepted samples.
    from apps.streams.pipeline import ingest_samples

    ingest_samples(persisted_samples)
    return len(persisted_samples)


def refresh_binding_schema(binding, *, accept_incompatible=False):
    channel = binding.channel
    new_schema = request_json(
        channel.stream,
        f"/v1/channels/{quote(channel.external_id, safe='')}/schema",
    )
    new_fields = {item["key"]: item for item in schema_fields(new_schema)}
    incompatible = _incompatible_field_keys(channel.schema, new_schema)
    version = str(new_schema.get("schema_version", ""))
    DataStreamSchemaVersion.objects.get_or_create(
        tenant=channel.tenant,
        channel=channel,
        version=version,
        defaults={"schema": new_schema},
    )
    if incompatible and not accept_incompatible:
        binding.status = BindingStatus.SCHEMA_REVIEW
        binding.last_error = f"Schema review required for: {', '.join(sorted(incompatible))}."
        binding.save(update_fields=["status", "last_error", "updated_at"])
        return 0
    with transaction.atomic():
        if incompatible:
            for key in incompatible:
                _disable_affected_kpis(
                    binding.machine,
                    key,
                    f"Disabled because stream field {key} changed type or unit in "
                    f"schema {version}.",
                )
        channel.schema = new_schema
        channel.schema_version = version
        channel.latest_cursor = str(new_schema.get("latest_cursor", channel.latest_cursor))
        channel.save()
        MachineParameter.objects.filter(machine=binding.machine, origin="stream").exclude(
            key__in=new_fields
        ).update(is_active=False)
        bind_machine(binding.machine, channel)
    return 0


def mark_poll_failure(binding, error):
    failures = binding.consecutive_failures + 1
    binding.consecutive_failures = failures
    binding.status = BindingStatus.DEGRADED
    binding.last_error = str(error)[:1000]
    binding.last_polled_at = timezone.now()
    binding.next_poll_at = timezone.now() + timedelta(seconds=min(300, 5 * (2 ** min(failures, 6))))
    binding.save()
