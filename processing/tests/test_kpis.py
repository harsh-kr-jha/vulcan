from decimal import Decimal

import pytest

from processing.kpis import KPIInputError, OEEInputs, calculate_oee


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
