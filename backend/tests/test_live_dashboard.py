from datetime import timedelta

import pytest
from apps.alerts.models import Alert, AlertRule
from apps.ml.models import MachineCycle
from apps.spatial.models import (
    FactoryLayout,
    MachineCurrentState,
    MachineParameter,
    MachineOperationalIssue,
    SpatialMachine,
)
from apps.spatial.services import update_machine_current_state
from apps.tenancy.models import FactoryMaster
from django.utils import timezone

pytestmark = pytest.mark.django_db


@pytest.fixture
def layout(tenant, factory):
    return FactoryLayout.objects.create(
        tenant=tenant, factory=factory, floor_width=50, floor_height=30
    )


def test_live_dashboard_defaults_to_attention_machine(api_client, tenant, factory, layout):
    line = FactoryMaster.objects.create(
        tenant=tenant, factory=factory, kind="lines", name="Line 1", code="L1"
    )
    process = FactoryMaster.objects.create(
        tenant=tenant,
        factory=factory,
        kind="processes",
        name="Splicing",
        code="SP",
        parent=line,
        metadata={"sequence": 1, "inputUnit": "m", "outputUnit": "m"},
    )
    running = SpatialMachine.objects.create(
        tenant=tenant,
        layout=layout,
        name="Running",
        code="RUN",
        process=process,
        position_x=1,
        position_y=1,
    )
    warning = SpatialMachine.objects.create(
        tenant=tenant,
        layout=layout,
        name="Warning",
        code="WARN",
        process=process,
        position_x=2,
        position_y=1,
    )
    for machine in (running, warning):
        MachineParameter.objects.create(
            machine=machine, key="temperature", label="Temperature", data_type="number"
        )
        MachineCurrentState.objects.create(
            tenant=tenant,
            machine=machine,
            observed_at=timezone.now(),
            source="stream",
            source_record_id=machine.id,
            values={"temperature": 42},
        )
    MachineCycle.objects.create(
        tenant=tenant,
        machine=warning,
        run_id="r1",
        cycle_id="c1",
        started_at=timezone.now(),
        violations={"temperature": True},
    )

    response = api_client.get(f"/api/dashboard/live/?factory={factory.id}")

    assert response.status_code == 200
    assert response.data["selectedMachineId"] == str(warning.id)
    assert response.data["current"]["process"]["code"] == "SP"
    assert response.data["current"]["highlightedVariables"][0]["abnormal"] is True


def test_current_state_never_moves_backwards(tenant, layout):
    machine = SpatialMachine.objects.create(
        tenant=tenant, layout=layout, name="Press", code="PRESS", position_x=1, position_y=1
    )
    newest = timezone.now()
    update_machine_current_state(
        machine=machine,
        observed_at=newest,
        source="stream",
        source_record_id=machine.id,
        values={"pressure": 8},
    )
    update_machine_current_state(
        machine=machine,
        observed_at=newest - timedelta(minutes=1),
        source="manual",
        source_record_id=layout.id,
        values={"pressure": 2},
    )

    state = MachineCurrentState.objects.get(machine=machine)
    assert state.observed_at == newest
    assert state.values == {"pressure": 8}


def test_inactive_machine_is_not_exposed(api_client, tenant, factory, layout):
    SpatialMachine.objects.create(
        tenant=tenant,
        layout=layout,
        name="Archived",
        code="OLD",
        is_active=False,
        position_x=1,
        position_y=1,
    )
    response = api_client.get(f"/api/dashboard/live/?factory={factory.id}")
    assert response.status_code == 200
    assert response.data["machines"] == []


def test_live_dashboard_includes_machine_alert_summary(api_client, tenant, factory, layout):
    machine = SpatialMachine.objects.create(
        tenant=tenant, layout=layout, name="Press", code="PRESS", position_x=1, position_y=1
    )
    rule = AlertRule.objects.create(
        tenant=tenant,
        name="Pressure",
        code="pressure",
        version="v1",
        metric="pressure",
        operator=">",
        threshold=10,
        time_window="live",
        grouping_dimension="machine",
        severity="high",
        recommendation_template="Inspect pressure",
    )
    Alert.objects.create(
        tenant=tenant,
        factory=factory,
        machine=machine,
        rule=rule,
        title="High pressure",
        explanation="Pressure is high",
        recommendation="Inspect",
        severity="high",
        observed_value="12",
        threshold_display="10",
        evaluation_start=timezone.now(),
        evaluation_end=timezone.now(),
    )
    response = api_client.get(f"/api/dashboard/live/?factory={factory.id}")
    summary = response.data["machines"][0]
    assert summary["alertCount"] == 1
    assert summary["highestAlertSeverity"] == "high"
    assert summary["attention"] is True


def test_live_dashboard_includes_duration_aware_issue_state(api_client, tenant, factory, layout):
    machine = SpatialMachine.objects.create(
        tenant=tenant, layout=layout, name="Press", code="PRESS", position_x=1, position_y=1
    )
    observed = timezone.now()
    MachineCurrentState.objects.create(
        tenant=tenant,
        machine=machine,
        observed_at=observed,
        source="stream",
        source_record_id=machine.id,
        values={"machine_status": "running"},
        operating_state="running",
        operating_state_since=observed,
    )
    MachineOperationalIssue.objects.create(
        tenant=tenant,
        machine=machine,
        issue_type="out_of_range",
        active=True,
        candidate_since=observed - timedelta(minutes=8),
        active_since=observed - timedelta(minutes=8),
        last_evaluated_at=observed,
        evidence={"parameters": ["temperature"], "count": 1},
    )
    response = api_client.get(f"/api/dashboard/live/?factory={factory.id}")
    summary = response.data["machines"][0]
    assert summary["operatingState"] == "running"
    assert summary["issues"][0]["type"] == "out_of_range"
    assert summary["issues"][0]["evidence"]["count"] == 1
    assert summary["attention"] is True
