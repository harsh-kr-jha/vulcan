from decimal import Decimal

import pytest

from processing.kpis import (
    KPIInputError,
    OEEInputs,
    SteamRecoveryInputs,
    calculate_oee,
    calculate_steam_recovery,
)


def test_calculate_oee_returns_components_and_version():
    result = calculate_oee(
        OEEInputs(
            planned_production_minutes=Decimal("480"),
            downtime_minutes=Decimal("86.4"),
            ideal_cycle_minutes=Decimal("0.02"),
            total_quantity=Decimal("17908.8"),
            good_quantity=Decimal("17192.448"),
        )
    )

    assert result.availability == Decimal("0.820000")
    assert result.performance == Decimal("0.910000")
    assert result.quality == Decimal("0.960000")
    assert result.oee == Decimal("0.716352")
    assert result.formula_version == "oee-v1"


def test_calculate_oee_rejects_invalid_reconciliation():
    with pytest.raises(KPIInputError, match="Good quantity"):
        calculate_oee(
            OEEInputs(
                planned_production_minutes=Decimal("480"),
                downtime_minutes=Decimal("20"),
                ideal_cycle_minutes=Decimal("1"),
                total_quantity=Decimal("100"),
                good_quantity=Decimal("101"),
            )
        )


def test_steam_recovery_uses_measured_temperature_lift_without_double_counting():
    result = calculate_steam_recovery(
        SteamRecoveryInputs(
            feedwater_kg=Decimal("10000"),
            feedwater_inlet_temperature_c=Decimal("30"),
            feedwater_tank_temperature_c=Decimal("70"),
            steam_generated_kg=Decimal("9000"),
            recovered_condensate_kg=Decimal("4500"),
            flash_steam_recovered_kg=Decimal("450"),
            briquette_used_kg=Decimal("1800"),
            briquette_gcv_kcal_per_kg=Decimal("3800"),
            boiler_efficiency_percent=Decimal("72"),
            production_quantity=Decimal("6000"),
        )
    )

    assert result.temperature_lift_c == Decimal("40.000")
    assert result.heat_recovered_mj == Decimal("1674.400")
    assert result.condensate_recovery_percent == Decimal("50.000000")
    assert result.flash_steam_recovery_percent == Decimal("5.000000")
    assert result.specific_steam_kg_per_unit == Decimal("1.500000")
    assert result.specific_briquette_kg_per_tonne_steam == Decimal("200.000000")
    assert result.equivalent_briquette_saved_kg > Decimal("140")
