from collections import defaultdict
from datetime import timedelta
from threading import Lock

from django.conf import settings
from django.core.cache import cache
from django.db.models import F, OuterRef, Subquery, Window
from django.db.models.functions import RowNumber
from django.utils import timezone

from apps.alerts.models import Alert
from apps.ml.models import FeatureSnapshot, MachineCycle, ObservationConfig, PredictionModel
from apps.streams.models import MachineCycleOutcome, MachineTelemetrySample

STATE_PRIORITY = {
    "down": 0,
    "warning": 1,
    "degraded": 2,
    "stale": 3,
    "running": 4,
    "idle": 5,
    "no_data": 6,
}

_HISTORY_CACHE_LOCKS = tuple(Lock() for _ in range(32))


def _related(machine, name):
    try:
        return getattr(machine, name)
    except Exception:
        return None


def _prediction(cycle):
    if not cycle:
        return None
    if hasattr(cycle, "latest_prediction_label"):
        if not cycle.latest_prediction_model_id:
            return None
        return {
            "modelId": str(cycle.latest_prediction_model_id),
            "observedAt": cycle.latest_prediction_observed_at,
            "failureProbability": cycle.latest_prediction_probability,
            "label": cycle.latest_prediction_label,
            "threshold": cycle.latest_prediction_threshold,
        }
    snapshots = sorted(cycle.snapshots.all(), key=lambda item: item.sequence_no)
    snapshot = next((item for item in reversed(snapshots) if item.model_id), None)
    if not snapshot:
        return None
    return {
        "modelId": str(snapshot.model_id),
        "observedAt": snapshot.observed_at,
        "failureProbability": snapshot.failure_probability,
        "label": snapshot.predicted_label,
        "threshold": snapshot.threshold,
    }


def _explicit_state(machine, values):
    status_keys = {
        parameter.key
        for parameter in machine.parameters.all()
        if parameter.is_active and parameter.semantic in {"status", "state"}
    } | {"status", "machine_status", "operating_status"}
    raw = next(
        (value for key in status_keys if (value := values.get(key)) is not None and value != ""),
        "",
    )
    value = str(raw).strip().casefold()
    if value in {"down", "stopped", "fault", "offline", "blocked", "error", "critical"}:
        return "down"
    if value in {"warning", "attention", "degraded"}:
        return "warning"
    if value in {"idle", "standby", "maintenance", "planned stop"}:
        return "idle"
    if value in {"running", "active", "operating"}:
        return "running"
    return ""


def machine_live_state(machine, now=None, cycle=None, prediction=None):
    now = now or timezone.now()
    current = _related(machine, "current_state")
    binding = _related(machine, "stream_binding")
    if binding and binding.status in {"degraded", "schema_review"}:
        return "degraded"
    if not current:
        return "no_data"
    poll_seconds = binding.channel.stream.poll_interval_seconds if binding else 10
    if now - current.observed_at > timedelta(seconds=max(3 * poll_seconds, 30)):
        return "stale"
    prediction = prediction if prediction is not None else _prediction(cycle)
    if cycle and any(bool(value) for value in (cycle.violations or {}).values()):
        return "warning"
    if prediction and prediction["label"] == "failure":
        return "warning"
    return _explicit_state(machine, current.values or {}) or "running"


def _identity(machine, state, current):
    process = machine.process
    line = process.parent if process and process.parent_id else None
    reasons = []
    if state == "down":
        reasons.append("Machine reported a stopped or fault state")
    elif state == "warning":
        reasons.append("An operating value or prediction needs attention")
    elif state == "degraded":
        reasons.append("The connected data stream is degraded")
    elif state == "stale":
        reasons.append("Live data is stale")
    operating_state = (
        "unknown"
        if state in {"stale", "no_data", "degraded"}
        else "inactive"
        if current and current.operating_state == "inactive"
        else "running"
    )
    issue_labels = {
        "out_of_range": "Out-of-range parameters",
        "predicted_failure": "Predicted failure",
        "high_rejects": "High rejects",
    }
    issues = [
        {
            "type": issue.issue_type,
            "label": issue_labels[issue.issue_type],
            "activeSince": issue.active_since,
            "evidence": issue.evidence,
        }
        for issue in machine.operational_issues.all()
        if issue.active and issue.active_since
    ]
    reasons.extend(issue["label"] for issue in issues)
    return {
        "id": str(machine.id),
        "name": machine.name,
        "code": machine.code,
        "process": {"id": str(process.id), "name": process.name, "code": process.code}
        if process
        else None,
        "line": {"id": str(line.id), "name": line.name, "code": line.code} if line else None,
        "state": state,
        "attention": state in {"down", "warning", "degraded", "stale"} or bool(issues),
        "attentionReasons": reasons,
        "operatingState": operating_state,
        "inactiveSince": current.operating_state_since
        if operating_state == "inactive" and current
        else None,
        "issues": issues,
        "alertCount": 0,
        "highestAlertSeverity": None,
        "lastObservedAt": current.observed_at if current else None,
        "placed": machine.position_x is not None and machine.position_y is not None,
    }


def _variable_payload(machine, values, violations):
    definitions = sorted(
        (parameter for parameter in machine.parameters.all() if parameter.is_active),
        key=lambda parameter: (parameter.order, parameter.key),
    )
    known, variables = set(), []
    io_keys = {
        f"input_{item.get('id')}": "input"
        for item in machine.inputs or []
        if isinstance(item, dict)
    }
    io_keys.update(
        {
            f"output_{item.get('id')}": "output"
            for item in machine.outputs or []
            if isinstance(item, dict)
        }
    )
    for parameter in definitions:
        known.add(parameter.key)
        variables.append(
            {
                "key": parameter.key,
                "label": parameter.label or parameter.key.replace("_", " ").title(),
                "value": values.get(parameter.key),
                "unit": parameter.unit,
                "semantic": io_keys.get(parameter.key, parameter.semantic),
                "abnormal": bool(violations.get(parameter.key)),
                "order": parameter.order,
            }
        )
    for order, (key, value) in enumerate(values.items(), start=len(variables)):
        if key not in known:
            variables.append(
                {
                    "key": key,
                    "label": key.replace("_", " ").title(),
                    "value": value,
                    "unit": "",
                    "semantic": io_keys.get(key, "measurement"),
                    "abnormal": bool(violations.get(key)),
                    "order": order,
                }
            )
    semantic_priority = {"input": 0, "output": 1, "context": 2, "status": 2, "state": 2}
    variables.sort(
        key=lambda item: (
            0 if item["abnormal"] else 1,
            semantic_priority.get(item["semantic"], 3),
            item["order"],
        )
    )
    abnormal = [item for item in variables if item["abnormal"]]
    highlighted = (
        abnormal + [item for item in variables if not item["abnormal"]][: max(0, 6 - len(abnormal))]
    )
    return highlighted, variables


def _history_bucket(observed_at, span):
    local = timezone.localtime(observed_at)
    if span <= timedelta(days=2):
        return local.replace(minute=0, second=0, microsecond=0)
    return local.replace(hour=0, minute=0, second=0, microsecond=0)


def _history_cache_key(machine_id, start, end):
    bucket_seconds = settings.LIVE_HISTORY_CACHE_BUCKET_SECONDS
    return (
        f"live-history:v2:{machine_id}:"
        f"{int(start.timestamp()) // bucket_seconds}:"
        f"{int(end.timestamp()) // bucket_seconds}"
    )


def _historical_performance(machine, start, end):
    """Reuse slow-changing history while live state remains uncached."""
    key = _history_cache_key(machine.id, start, end)
    cached = cache.get(key)
    if cached is not None:
        return cached
    lock = _HISTORY_CACHE_LOCKS[hash(key) % len(_HISTORY_CACHE_LOCKS)]
    with lock:
        cached = cache.get(key)
        if cached is not None:
            return cached
        result = _build_historical_performance(machine, start, end)
        cache.set(key, result, settings.LIVE_HISTORY_CACHE_TTL_SECONDS)
        return result


def _build_historical_performance(machine, start, end):
    """Return bounded, cycle-level production and model evidence for the dashboard."""
    outcome_rows = MachineCycleOutcome.objects.filter(
        machine=machine,
        run_id=OuterRef("run_id"),
        cycle_id=OuterRef("cycle_id"),
    ).order_by()
    prediction_rows = FeatureSnapshot.objects.filter(
        cycle_id=OuterRef("pk"), model__isnull=False
    ).order_by("-checkpoint", "-sequence_no")
    cycles = (
        MachineCycle.objects.filter(machine=machine, started_at__gte=start, started_at__lte=end)
        .annotate(
            outcome_label=Subquery(outcome_rows.values("effective_label")[:1]),
            outcome_failure_mode=Subquery(outcome_rows.values("failure_mode")[:1]),
            latest_prediction=Subquery(prediction_rows.values("predicted_label")[:1]),
            prediction_model_metrics=Subquery(prediction_rows.values("model__metrics")[:1]),
        )
        .values(
            "started_at",
            "violations",
            "outcome_label",
            "outcome_failure_mode",
            "latest_prediction",
            "prediction_model_metrics",
        )
        .order_by("started_at")
    )

    matrix = {"truePositive": 0, "trueNegative": 0, "falsePositive": 0, "falseNegative": 0}
    cycle_count = known_outcomes = 0
    predicted_failures = actual_failures = out_of_range = labelled_predictions = correct = 0
    baseline_value = None
    failure_modes = defaultdict(int)
    bucket_rows = defaultdict(
        lambda: {
            "produced": 0,
            "rejected": 0,
            "predictedFailures": 0,
            "correct": 0,
            "labelled": 0,
        }
    )
    span = end - start
    for cycle in cycles.iterator(chunk_size=2000):
        cycle_count += 1
        bucket = bucket_rows[_history_bucket(cycle["started_at"], span)]
        bucket["produced"] += 1
        if any(bool(value) for value in (cycle["violations"] or {}).values()):
            out_of_range += 1
        actual = cycle["outcome_label"]
        known_outcomes += int(actual in {"good", "failure"})
        if actual == "failure":
            actual_failures += 1
            bucket["rejected"] += 1
            failure_modes[cycle["outcome_failure_mode"] or "Unspecified"] += 1
        predicted = cycle["latest_prediction"]
        metrics = cycle["prediction_model_metrics"]
        if baseline_value is None and isinstance(metrics, dict):
            baseline_value = metrics.get("accuracy", metrics.get("balanced_accuracy"))
        if predicted == "failure":
            predicted_failures += 1
            bucket["predictedFailures"] += 1
        if predicted in {"good", "failure"} and actual in {"good", "failure"}:
            labelled_predictions += 1
            bucket["labelled"] += 1
            is_correct = predicted == actual
            correct += int(is_correct)
            bucket["correct"] += int(is_correct)
            if predicted == "failure" and actual == "failure":
                matrix["truePositive"] += 1
            elif predicted == "good" and actual == "good":
                matrix["trueNegative"] += 1
            elif predicted == "failure":
                matrix["falsePositive"] += 1
            else:
                matrix["falseNegative"] += 1

    accuracy = (correct / labelled_predictions * 100) if labelled_predictions else None
    baseline = (
        float(baseline_value) * 100
        if isinstance(baseline_value, (int, float)) and baseline_value <= 1
        else baseline_value
    )
    accuracy_drop = (
        float(baseline) - accuracy
        if accuracy is not None and isinstance(baseline, (int, float))
        else None
    )
    needs_retraining = bool(
        labelled_predictions >= 10
        and accuracy is not None
        and (accuracy < 80 or (accuracy_drop is not None and accuracy_drop >= 10))
    )

    timeline = [
        {
            "at": at,
            **row,
            "accuracy": row["correct"] / row["labelled"] * 100 if row["labelled"] else None,
        }
        for at, row in sorted(bucket_rows.items())
    ]

    definitions = {
        parameter.key: parameter
        for parameter in machine.parameters.filter(is_active=True, data_type="number").only(
            "key", "label", "unit"
        )
    }
    samples = list(
        MachineTelemetrySample.objects.filter(
            machine=machine, observed_at__gte=start, observed_at__lte=end
        )
        .only("observed_at", "values")
        .order_by("observed_at")[:6000]
    )
    stride = max(1, len(samples) // 180)
    sampled = samples[::stride]
    active_profile = (
        ObservationConfig.objects.filter(machine=machine).select_related("active_profile").first()
    )
    profile_ranges = (
        active_profile.active_profile.ranges or []
        if active_profile and active_profile.active_profile
        else []
    )
    range_map = {
        item.get("key"): item
        for item in profile_ranges
        if isinstance(item, dict) and item.get("key")
    }
    parameter_trends = []
    for key, definition in definitions.items():
        points = [
            {"at": sample.observed_at, "value": sample.values.get(key)}
            for sample in sampled
            if isinstance(sample.values.get(key), (int, float))
            and not isinstance(sample.values.get(key), bool)
        ]
        if points:
            limits = range_map.get(key, {})
            parameter_trends.append(
                {
                    "key": key,
                    "label": definition.label or key.replace("_", " ").title(),
                    "unit": definition.unit,
                    "min": limits.get("min"),
                    "max": limits.get("max"),
                    "points": points,
                }
            )

    return {
        "range": {"from": start, "to": end},
        "summary": {
            "totalTubes": cycle_count,
            "acceptedTubes": max(0, known_outcomes - actual_failures),
            "rejectedTubes": actual_failures,
            "rejectionRate": actual_failures / known_outcomes * 100 if known_outcomes else 0,
            "outsideRange": out_of_range,
            "predictedFailures": predicted_failures,
            "labelledPredictions": labelled_predictions,
            "pendingOutcomes": max(0, cycle_count - known_outcomes),
            "accuracy": accuracy,
            "baselineAccuracy": baseline,
            "accuracyDrop": accuracy_drop,
        },
        "confusionMatrix": matrix,
        "timeline": timeline,
        "parameterTrends": parameter_trends,
        "failureModes": [
            {"label": label, "count": count}
            for label, count in sorted(
                failure_modes.items(), key=lambda item: item[1], reverse=True
            )
        ],
        "modelAlert": {
            "active": needs_retraining,
            "title": "Model accuracy has dropped",
            "message": "Retrain and recalibrate this model using recent verified tube outcomes.",
        },
    }


def build_live_dashboard(factory, requested_machine_id=None, history_from=None, history_to=None):
    now = timezone.now()
    machines = list(
        factory.spatial_layout.machines.filter(is_active=True)
        .select_related("process__parent", "current_state", "stream_binding__channel__stream")
        .prefetch_related("parameters", "operational_issues")
        .order_by("display_order", "name")
    )
    active_alerts = Alert.objects.filter(
        factory=factory, machine__isnull=False, status__in=["new", "acknowledged"]
    ).values_list("machine_id", "severity")
    alert_map = {}
    severity_rank = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    for machine_id, severity in active_alerts:
        entry = alert_map.setdefault(str(machine_id), {"count": 0, "severity": None})
        entry["count"] += 1
        if entry["severity"] is None or severity_rank.get(severity, 99) < severity_rank.get(
            entry["severity"], 99
        ):
            entry["severity"] = severity
    latest_cycles = (
        MachineCycle.objects.filter(tenant=factory.tenant, machine__layout__factory=factory)
        .annotate(
            machine_rank=Window(
                expression=RowNumber(),
                partition_by=[F("machine_id")],
                order_by=F("started_at").desc(),
            )
        )
        .filter(machine_rank=1)
    )
    latest_snapshot = FeatureSnapshot.objects.filter(
        cycle_id=OuterRef("pk"), model__isnull=False
    ).order_by("-sequence_no")
    latest_cycles = latest_cycles.annotate(
        latest_prediction_model_id=Subquery(latest_snapshot.values("model_id")[:1]),
        latest_prediction_observed_at=Subquery(latest_snapshot.values("observed_at")[:1]),
        latest_prediction_probability=Subquery(
            latest_snapshot.values("failure_probability")[:1]
        ),
        latest_prediction_label=Subquery(latest_snapshot.values("predicted_label")[:1]),
        latest_prediction_threshold=Subquery(latest_snapshot.values("threshold")[:1]),
    )
    cycles = {cycle.machine_id: cycle for cycle in latest_cycles}
    summaries = []
    for machine in machines:
        cycle = cycles.get(machine.id)
        prediction = _prediction(cycle)
        current = _related(machine, "current_state")
        violations = (cycle.violations or {}) if cycle else {}
        _, variables = _variable_payload(
            machine,
            (current.values or {}) if current else {},
            violations,
        )
        summary = _identity(
            machine,
            machine_live_state(machine, now, cycle, prediction),
            current,
        )
        summary["variables"] = variables
        summary["currentCyclePrediction"] = (
            {
                "cycleId": cycle.cycle_id,
                "observedAt": prediction["observedAt"],
                "label": prediction["label"],
                "failureProbability": prediction["failureProbability"],
            }
            if cycle and prediction
            else None
        )
        alert_summary = alert_map.get(str(machine.id))
        if alert_summary:
            summary["alertCount"] = alert_summary["count"]
            summary["highestAlertSeverity"] = alert_summary["severity"]
            summary["attention"] = True
            summary["attentionReasons"].append(
                f"{alert_summary['count']} active alert{'s' if alert_summary['count'] != 1 else ''}"
            )
        summaries.append(summary)
    by_id = {item["id"]: item for item in summaries}
    if requested_machine_id:
        if str(requested_machine_id) not in by_id:
            raise ValueError("The selected machine is not active in this factory.")
        selected_id = str(requested_machine_id)
    else:
        display_order = {str(machine.id): machine.display_order for machine in machines}
        ordered = sorted(
            summaries,
            key=lambda item: (
                STATE_PRIORITY.get(item["state"], 99),
                -(item["lastObservedAt"].timestamp() if item["lastObservedAt"] else 0),
                display_order[item["id"]],
            ),
        )
        selected_id = ordered[0]["id"] if ordered else None
    selected = next((machine for machine in machines if str(machine.id) == selected_id), None)
    current_payload = None
    if selected:
        current = _related(selected, "current_state")
        binding = _related(selected, "stream_binding")
        cycle = cycles.get(selected.id)
        prediction = _prediction(cycle)
        violations = (cycle.violations or {}) if cycle else {}
        values = (current.values or {}) if current else {}
        highlighted, all_variables = _variable_payload(selected, values, violations)
        config = (
            ObservationConfig.objects.filter(machine=selected)
            .select_related("active_profile")
            .first()
        )
        has_active_model = bool(
            config
            and config.active_profile_id
            and PredictionModel.objects.filter(
                profile__machine=selected,
                profile__sku=config.active_profile.sku,
                profile__contract=config.active_profile.contract,
                profile__checkpoint_phase=config.active_profile.checkpoint_phase,
                profile__checkpoint_second=config.active_profile.checkpoint_second,
                active=True,
            ).exists()
        )
        current_payload = {
            **by_id[selected_id],
            "source": current.source if current else None,
            "observedAt": current.observed_at if current else None,
            "activity": {
                "runId": current.run_id if current else "",
                "cycleId": current.cycle_id if current else "",
                "cycleNumber": current.cycle_number if current else None,
                "phase": current.cycle_phase if current else "",
                "recipeId": current.recipe_id if current else "",
            },
            "highlightedVariables": highlighted,
            "variables": all_variables,
            "violations": violations,
            "stream": {
                "name": binding.channel.stream.name,
                "channel": binding.channel.name,
                "status": binding.status,
                "lastReceivedAt": binding.last_received_at,
                "lastError": binding.last_error,
            }
            if binding
            else None,
            "ml": {
                "enabled": bool(config and config.enabled),
                "active": has_active_model,
                "health": cycle.health if cycle else None,
                "prediction": prediction,
            },
            "history": _historical_performance(
                selected,
                history_from or now - timedelta(days=7),
                history_to or now,
            ),
        }
    return {
        "factoryId": str(factory.id),
        "layoutExists": True,
        "machines": summaries,
        "selectedMachineId": selected_id,
        "current": current_payload,
        "generatedAt": now,
    }
