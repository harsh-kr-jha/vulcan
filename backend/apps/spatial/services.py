from django.db import transaction

from apps.spatial.models import MachineCurrentState
from apps.spatial.operational_status import explicit_operating_state


@transaction.atomic
def update_machine_current_state(
    *,
    machine,
    observed_at,
    source,
    source_record_id,
    values,
    schema_version="",
    run_id="",
    cycle_id="",
    cycle_number=None,
    cycle_phase="",
    recipe_id="",
):
    """Advance the current-state projection without allowing stale events to win."""
    current = (
        MachineCurrentState.objects.select_for_update().filter(machine=machine).first()
    )
    if current and current.observed_at > observed_at:
        return current
    defaults = {
        "tenant": machine.tenant,
        "observed_at": observed_at,
        "source": source,
        "source_record_id": source_record_id,
        "values": values,
        "schema_version": schema_version,
        "run_id": run_id,
        "cycle_id": cycle_id,
        "cycle_number": cycle_number,
        "cycle_phase": cycle_phase,
        "recipe_id": recipe_id,
    }
    operating_state = explicit_operating_state(machine, values)
    previous_operating_state = current.operating_state if current else "unknown"
    previous_state_since = current.operating_state_since if current else None
    if operating_state == "unknown" and current:
        operating_state = previous_operating_state
    defaults["operating_state"] = operating_state
    defaults["operating_state_since"] = (
        previous_state_since
        if operating_state == previous_operating_state and previous_state_since
        else observed_at
    )
    if current:
        for field, value in defaults.items():
            setattr(current, field, value)
        current.save()
        return current
    return MachineCurrentState.objects.create(machine=machine, **defaults)
