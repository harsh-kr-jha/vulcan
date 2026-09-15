from django.db import transaction

from apps.spatial.models import MachineCurrentState


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
    if current:
        for field, value in defaults.items():
            setattr(current, field, value)
        current.save()
        return current
    return MachineCurrentState.objects.create(machine=machine, **defaults)

