from datetime import timedelta

import pytest
from apps.spatial.models import FactoryLayout, MachineOperationalIssue, SpatialMachine
from apps.spatial.operational_status import update_operational_issue
from apps.spatial.services import update_machine_current_state
from apps.ml.worker import update_reject_issue
from apps.streams.models import MachineCycleOutcome
from django.utils import timezone

pytestmark = pytest.mark.django_db


@pytest.fixture
def machine(tenant, factory):
    layout = FactoryLayout.objects.create(
        tenant=tenant, factory=factory, floor_width=20, floor_height=10
    )
    return SpatialMachine.objects.create(
        tenant=tenant, layout=layout, name="Press", code="PRESS", position_x=1, position_y=1
    )


def test_out_of_range_requires_continuous_confirmation(machine):
    started = timezone.now()
    issue = update_operational_issue(
        machine=machine,
        issue_type=MachineOperationalIssue.IssueType.OUT_OF_RANGE,
        detected=True,
        observed_at=started,
        confirmation_seconds=60,
        evidence={"parameters": ["temperature"]},
    )
    assert issue.active is False
    issue = update_operational_issue(
        machine=machine,
        issue_type=MachineOperationalIssue.IssueType.OUT_OF_RANGE,
        detected=True,
        observed_at=started + timedelta(seconds=60),
        confirmation_seconds=60,
    )
    assert issue.active is True
    assert issue.active_since == started

    issue = update_operational_issue(
        machine=machine,
        issue_type=MachineOperationalIssue.IssueType.OUT_OF_RANGE,
        detected=False,
        observed_at=started + timedelta(seconds=61),
    )
    assert issue.active is False
    assert issue.active_since is None


def test_explicit_machine_state_tracks_inactive_duration(machine):
    observed = timezone.now()
    state = update_machine_current_state(
        machine=machine,
        observed_at=observed,
        source="stream",
        source_record_id=machine.id,
        values={"machine_status": "stopped"},
    )
    assert state.operating_state == "inactive"
    assert state.operating_state_since == observed

    unchanged = update_machine_current_state(
        machine=machine,
        observed_at=observed + timedelta(minutes=1),
        source="stream",
        source_record_id=machine.id,
        values={"temperature": 42},
    )
    assert unchanged.operating_state == "inactive"
    assert unchanged.operating_state_since == observed

    resumed = update_machine_current_state(
        machine=machine,
        observed_at=observed + timedelta(minutes=2),
        source="stream",
        source_record_id=machine.id,
        values={"machine_status": "running"},
    )
    assert resumed.operating_state == "running"
    assert resumed.operating_state_since == observed + timedelta(minutes=2)


def test_high_rejects_uses_factory_target_and_rolling_outcomes(machine):
    for index in range(10):
        MachineCycleOutcome.objects.create(
            tenant=machine.tenant,
            machine=machine,
            run_id="run",
            cycle_id=f"cycle-{index}",
            effective_label="failure" if index < 2 else "good",
            source_label="failure" if index < 2 else "good",
        )
    update_reject_issue(machine, timezone.now())
    issue = MachineOperationalIssue.objects.get(
        machine=machine, issue_type=MachineOperationalIssue.IssueType.HIGH_REJECTS
    )
    assert issue.active is True
    assert issue.evidence["rejectRate"] == 20
    assert issue.evidence["targetRate"] == 2
