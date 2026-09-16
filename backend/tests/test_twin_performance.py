"""Tests for Digital Twin telemetry as single source of truth for performance analytics."""

import pytest
from datetime import date, timedelta
from django.utils import timezone
from apps.spatial.models import (
    FactoryLayout,
    MachineObservation,
    SpatialMachine,
    InventoryConfiguration,
    DispatchConfiguration,
    DispatchEvent,
)
from apps.operations.models import StandardRecord
from apps.analytics.workspace import build_intelligence, DEFAULT_TARGETS

pytestmark = pytest.mark.django_db


def test_twin_is_single_source_of_truth_without_standard_records(tenant, factory):
    """When a digital twin exists, performance analytics derive 100% from twin data with zero StandardRecords."""
    # Ensure no StandardRecord exists
    StandardRecord.objects.filter(factory=factory).delete()
    assert StandardRecord.objects.filter(factory=factory).count() == 0

    layout = FactoryLayout.objects.create(
        tenant=tenant,
        factory=factory,
        floor_width=50,
        floor_height=16,
        unit_system="meters",
    )
    room1 = SpatialMachine.objects.create(
        tenant=tenant,
        layout=layout,
        name="Room 1",
        position_x=1,
        position_y=1,
        size_width=6,
        size_height=6,
    )
    room2 = SpatialMachine.objects.create(
        tenant=tenant,
        layout=layout,
        name="Room 2",
        position_x=9,
        position_y=1,
        size_width=6,
        size_height=6,
    )

    now = timezone.now()
    # Create 3 days of historical telemetry
    for d in range(3):
        t_stamp = now - timedelta(days=d)
        obs1 = MachineObservation.objects.create(
            tenant=tenant,
            machine=room1,
            values={
                "temperature_c": 17.5 + d * 0.2,
                "humidity_pct": 91.0,
                "co2_ppm": 1150.0,
                "daily_yield_kg": 400.0 + d * 20.0,
                "planned_yield_kg": 450.0,
                "contamination_kg": 10.0,
                "substrate_dry_kg": 5000.0,
                "growing_area_m2": 180.0,
                "water_litres": 800.0,
                "crop_age_days": 20.0 + d,
                "crop_stage": "Harvest Phase",
            },
        )
        MachineObservation.objects.filter(id=obs1.id).update(submitted_at=t_stamp)

        obs2 = MachineObservation.objects.create(
            tenant=tenant,
            machine=room2,
            values={
                "temperature_c": 18.0,
                "humidity_pct": 89.5,
                "co2_ppm": 1220.0,
                "daily_yield_kg": 350.0,
                "planned_yield_kg": 380.0,
                "contamination_kg": 8.0,
                "substrate_dry_kg": 4800.0,
                "growing_area_m2": 180.0,
                "water_litres": 750.0,
                "crop_age_days": 18.0 + d,
                "crop_stage": "Harvest Phase",
            },
        )
        MachineObservation.objects.filter(id=obs2.id).update(submitted_at=t_stamp)

    # Add inventory
    inv = InventoryConfiguration.objects.create(
        tenant=tenant,
        layout=layout,
        storage_capacity=100000,
        capacity_unit="kg",
        materials=[
            {"id": "mat_straw", "name": "Wheat Straw", "quantity": 30000, "unit": "kg"},
        ],
    )

    # Add dispatch
    disp = DispatchConfiguration.objects.create(
        tenant=tenant,
        layout=layout,
        products=[{"id": "p_btn", "name": "Button Mushrooms", "unit": "kg"}],
    )
    DispatchEvent.objects.create(
        tenant=tenant,
        dispatch=disp,
        product_id="p_btn",
        event_type="dispatched",
        quantity=1200,
        unit="kg",
    )

    # Generate workspace intelligence
    intel = build_intelligence(factory, DEFAULT_TARGETS, {})

    # Verifications
    assert StandardRecord.objects.filter(factory=factory).count() == 0
    assert intel["totals"]["actual"] > 0
    assert intel["totals"]["planned"] > 0
    assert intel["mushroom"]["biologicalEfficiency"] > 0
    assert intel["mushroom"]["saleableYield"] > 0
    assert len(intel["productionTrend"]) >= 3
    assert len(intel["roomConditions"]) >= 2
