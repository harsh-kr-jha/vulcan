from decimal import Decimal

import pytest

from processing.kpis import (
    KPIInputError,
    MushroomKPIInputs,
    OEEInputs,
    calculate_mushroom_kpis,
    calculate_oee,
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


def test_calculate_mushroom_kpis_returns_cultivation_measures():
    result = calculate_mushroom_kpis(
        MushroomKPIInputs(
            planned_harvest_kg=Decimal("1000"),
            total_harvest_kg=Decimal("940"),
            saleable_harvest_kg=Decimal("880"),
            contaminated_harvest_kg=Decimal("20"),
            dry_substrate_kg=Decimal("1000"),
            growing_area_m2=Decimal("200"),
            water_litres=Decimal("4000"),
            compliant_environment_readings=Decimal("18"),
            total_environment_readings=Decimal("20"),
            crop_age_days_total=Decimal("70"),
            crop_batches=Decimal("2"),
        )
    )

    assert result.plan_attainment == Decimal("94.000000")
    assert result.biological_efficiency == Decimal("94.000000")
    assert result.saleable_yield == Decimal("93.617021")
    assert result.contamination_rate == Decimal("2.127660")
    assert result.yield_per_m2 == Decimal("4.400000")
    assert result.water_productivity_kg_per_kl == Decimal("220.000000")
    assert result.environment_compliance == Decimal("90.000000")
    assert result.average_crop_age_days == Decimal("35.000000")
    assert result.formula_version == "mushroom-kpis-v1"


def test_calculate_mushroom_kpis_rejects_impossible_saleable_harvest():
    with pytest.raises(KPIInputError, match="Saleable harvest"):
        calculate_mushroom_kpis(
            MushroomKPIInputs(
                planned_harvest_kg=Decimal("100"),
                total_harvest_kg=Decimal("90"),
                saleable_harvest_kg=Decimal("91"),
                contaminated_harvest_kg=Decimal("0"),
                dry_substrate_kg=Decimal("100"),
                growing_area_m2=Decimal("20"),
                water_litres=Decimal("100"),
                compliant_environment_readings=Decimal("1"),
                total_environment_readings=Decimal("1"),
                crop_age_days_total=Decimal("35"),
                crop_batches=Decimal("1"),
            )
        )
