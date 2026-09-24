from datetime import timedelta

from django.utils import timezone
from django.db.models import F, Window, prefetch_related_objects
from django.db.models.functions import RowNumber

from apps.alerts.models import Alert
from apps.ml.models import MachineCycle, ObservationConfig, PredictionModel

STATE_PRIORITY = {
    "down": 0,
    "warning": 1,
    "degraded": 2,
    "stale": 3,
    "running": 4,
    "idle": 5,
    "no_data": 6,
}


def _related(machine, name):
    try:
        return getattr(machine, name)
    except Exception:
        return None


def _prediction(cycle):
    if not cycle:
        return None
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


def machine_live_state(machine, now=None, cycle=None):
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
    prediction = _prediction(cycle)
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
    definitions = list(machine.parameters.filter(is_active=True).order_by("order", "key"))
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


def build_live_dashboard(factory, requested_machine_id=None):
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
    latest_cycles = MachineCycle.objects.filter(
        tenant=factory.tenant, machine__layout__factory=factory
    ).annotate(
        machine_rank=Window(
            expression=RowNumber(),
            partition_by=[F("machine_id")],
            order_by=F("started_at").desc(),
        )
    ).filter(machine_rank=1)
    cycles = {cycle.machine_id: cycle for cycle in latest_cycles}
    summaries = []
    for machine in machines:
        cycle = cycles.get(machine.id)
        summary = _identity(
            machine, machine_live_state(machine, now, cycle), _related(machine, "current_state")
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
        if cycle:
            prefetch_related_objects([cycle], "snapshots")
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
        }
    return {
        "factoryId": str(factory.id),
        "layoutExists": True,
        "machines": summaries,
        "selectedMachineId": selected_id,
        "current": current_payload,
        "generatedAt": now,
    }
