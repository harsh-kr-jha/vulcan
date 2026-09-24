from datetime import timedelta

from django.db import transaction

from apps.spatial.models import MachineOperationalIssue, default_status_visualization


INACTIVE_VALUES = {
    "down",
    "stopped",
    "fault",
    "offline",
    "blocked",
    "error",
    "critical",
    "idle",
    "standby",
    "maintenance",
    "planned stop",
}
RUNNING_VALUES = {"running", "active", "operating"}


def status_visualization_config(machine):
    configured = machine.layout.status_visualization or {}
    return {**default_status_visualization(), **configured}


def explicit_operating_state(machine, values):
    status_keys = {
        parameter.key
        for parameter in machine.parameters.filter(
            is_active=True, semantic__in=["status", "state"]
        )
    } | {"status", "machine_status", "operating_status"}
    raw = next(
        (values.get(key) for key in status_keys if values.get(key) not in (None, "")),
        "",
    )
    value = str(raw).strip().casefold()
    if value in INACTIVE_VALUES:
        return "inactive"
    if value in RUNNING_VALUES:
        return "running"
    return "unknown"


@transaction.atomic
def update_operational_issue(
    *, machine, issue_type, detected, observed_at, evidence=None, confirmation_seconds=0
):
    issue, _ = MachineOperationalIssue.objects.select_for_update().get_or_create(
        machine=machine,
        issue_type=issue_type,
        defaults={"tenant": machine.tenant},
    )
    if issue.last_evaluated_at and observed_at < issue.last_evaluated_at:
        return issue

    issue.last_evaluated_at = observed_at
    issue.evidence = evidence or {}
    if not detected:
        issue.active = False
        issue.candidate_since = None
        issue.active_since = None
    else:
        if issue.candidate_since is None:
            issue.candidate_since = observed_at
        confirmed = observed_at - issue.candidate_since >= timedelta(
            seconds=max(0, confirmation_seconds)
        )
        if confirmed and not issue.active:
            issue.active = True
            issue.active_since = issue.candidate_since
    issue.save()
    return issue
