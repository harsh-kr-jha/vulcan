import hashlib
import json
import math

from django.db import transaction

from apps.ml.models import FeatureSnapshot, MachineCycle, ObservationConfig, PredictionModel


def field_contract(fields):
    return hashlib.sha256(json.dumps(fields, sort_keys=True).encode()).hexdigest()


def feature_fields(machine):
    return list(
        machine.parameters.filter(is_active=True, data_type__in=["number", "boolean", "selection"])
        .exclude(
            semantic__in=[
                "quality_outcome",
                "counter",
                "label",
                "outcome",
                "identifier",
                "timestamp",
                "health",
            ]
        )
        .exclude(
            key__in=[
                "is_failure",
                "splice_result",
                "failure_mode",
                "quality_score",
                "sensor_data_quality",
                "cycle_number",
                "sequence_no",
                "run_id",
                "cycle_id",
                "event_id",
                "observed_at",
                "received_at",
                "failure_within_5_cycles",
                "cycle_health",
                "rule_health",
            ]
        )
        .order_by("key")
        .values("key", "data_type", "unit", "options")
    )


@transaction.atomic
def observe(sample):
    if not sample.run_id or not sample.cycle_id:
        ObservationConfig.objects.filter(machine=sample.machine, enabled=True).update(
            stale_reason="ML Observation requires run_id and cycle_id on each reading."
        )
        return
    config, _ = ObservationConfig.objects.get_or_create(
        machine=sample.machine, defaults={"tenant": sample.tenant}
    )
    config = ObservationConfig.objects.select_for_update().get(pk=config.pk)
    cycle = MachineCycle.objects.filter(
        machine=sample.machine, run_id=sample.run_id, cycle_id=sample.cycle_id
    ).first()
    if cycle is None:
        MachineCycle.objects.filter(machine=sample.machine, completed=False).update(completed=True)
        if config.pending_profile_id:
            config.active_profile = config.pending_profile
            config.pending_profile = None
            config.save()
        cycle = MachineCycle.objects.create(
            tenant=sample.tenant,
            machine=sample.machine,
            run_id=sample.run_id,
            cycle_id=sample.cycle_id,
            started_at=sample.observed_at,
            profile=config.active_profile if config.enabled else None,
        )
    if (
        not config.enabled
        or not cycle.profile_id
        or FeatureSnapshot.objects.filter(event_id=sample.event_id).exists()
    ):
        return
    profile = cycle.profile
    current = {f["key"]: f for f in feature_fields(sample.machine)}
    if any(current.get(f["key"]) != f for f in profile.fields):
        config.stale_reason = (
            "Published input fields changed. Publish a reviewed production profile."
        )
        config.save(update_fields=["stale_reason"])
        return
    phase = sample.cycle_phase
    state = cycle.accumulator
    state["elapsed"] = state.get("elapsed", 0) + 1
    phase_counts = state.setdefault("phases", {})
    phase_counts[phase] = phase_counts.get(phase, 0) + 1
    features = {"context:phase": phase, "context:elapsed": state["elapsed"]}
    for field in profile.fields:
        key = field["key"]
        value = sample.values.get(key)
        prefix = f"field:{key}:phase:{phase}"
        stats = state.setdefault(prefix, {"n": 0, "sum": 0, "squares": 0, "frequencies": {}})
        valid = value is not None
        if field["data_type"] == "number":
            valid = (
                isinstance(value, (int, float))
                and not isinstance(value, bool)
                and math.isfinite(value)
            )
            if valid:
                stats["n"] += 1
                stats["sum"] += value
                stats["squares"] += value * value
                stats.setdefault("first", value)
                stats["latest"] = value
                stats["min"] = min(stats.get("min", value), value)
                stats["max"] = max(stats.get("max", value), value)
        elif valid:
            stats["n"] += 1
            stats["latest"] = str(value)
            stats["frequencies"][str(value)] = stats["frequencies"].get(str(value), 0) + 1
        stats["missing"] = int(not valid)
    for prefix, stats in state.items():
        if not prefix.startswith("field:"):
            continue
        n = stats["n"]
        features[f"{prefix}:missing"] = stats["missing"]
        features[f"{prefix}:count"] = n
        if not n:
            continue
        features[f"{prefix}:latest"] = stats["latest"]
        if isinstance(stats["latest"], (int, float)):
            mean = stats["sum"] / n
            features.update(
                {
                    f"{prefix}:mean": mean,
                    f"{prefix}:min": stats["min"],
                    f"{prefix}:max": stats["max"],
                    f"{prefix}:std": math.sqrt(max(0, stats["squares"] / n - mean * mean)),
                    f"{prefix}:slope": (stats["latest"] - stats["first"]) / max(1, n - 1),
                }
            )
        else:
            for value, count in stats["frequencies"].items():
                features[f"{prefix}:frequency:{value}"] = count / n
    violations = {}
    for rule in profile.ranges:
        if phase not in rule["phases"]:
            continue
        value = sample.values.get(rule["key"])
        inside = (
            isinstance(value, (int, float))
            and not isinstance(value, bool)
            and rule["min"] <= value <= rule["max"]
        )
        cycle.total_weight += rule["weight"]
        cycle.passed_weight += rule["weight"] if inside else 0
        cycle.violations[rule["key"]] = not inside
        violations[rule["key"]] = not inside
    cycle.health = 100 * cycle.passed_weight / cycle.total_weight if cycle.total_weight else None
    cycle.accumulator = state
    cycle.save()
    snapshot = FeatureSnapshot.objects.create(
        tenant=sample.tenant,
        cycle=cycle,
        event_id=sample.event_id,
        observed_at=sample.observed_at,
        sequence_no=sample.sequence_no,
        features=features,
        checkpoint=phase == profile.checkpoint_phase
        and phase_counts[phase] == profile.checkpoint_second,
        violations=violations,
    )
    if config.stale_reason.lower() == "database is locked":
        config.stale_reason = ""
        config.save(update_fields=["stale_reason"])
    model = PredictionModel.objects.filter(
        profile__machine=sample.machine,
        profile__sku=profile.sku,
        profile__contract=profile.contract,
        profile__checkpoint_phase=profile.checkpoint_phase,
        profile__checkpoint_second=profile.checkpoint_second,
        active=True,
    ).first()
    if model:
        from apps.ml.registry import load_model

        try:
            pipeline = load_model(model)
            probability = float(pipeline.predict_proba([features])[0][1])
            snapshot.model = model
            snapshot.failure_probability = probability
            snapshot.threshold = model.threshold
            snapshot.predicted_label = "failure" if probability >= model.threshold else "good"
            snapshot.save()
            if config.stale_reason:
                config.stale_reason = ""
                config.save(update_fields=["stale_reason"])
        except Exception as exc:
            config.stale_reason = f"Model unavailable: {exc}"[:500]
            config.save(update_fields=["stale_reason"])
