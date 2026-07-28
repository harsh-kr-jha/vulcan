from dataclasses import dataclass
from decimal import Decimal, InvalidOperation


class KPIInputError(ValueError):
    pass


@dataclass(frozen=True)
class OEEInputs:
    planned_production_minutes: Decimal
    downtime_minutes: Decimal
    ideal_cycle_minutes: Decimal
    total_quantity: Decimal
    good_quantity: Decimal


@dataclass(frozen=True)
class OEEResult:
    availability: Decimal
    performance: Decimal
    quality: Decimal
    oee: Decimal
    formula_version: str = "oee-v1"

    def as_dict(self) -> dict:
        return {
            "kpi": "oee",
            "value": float(self.oee),
            "inputs": {
                "availability": float(self.availability),
                "performance": float(self.performance),
                "quality": float(self.quality),
            },
            "formula_version": self.formula_version,
        }


def calculate_oee(inputs: OEEInputs) -> OEEResult:
    values = vars(inputs)
    if any(value < 0 for value in values.values()):
        raise KPIInputError("OEE inputs cannot be negative.")
    if inputs.downtime_minutes > inputs.planned_production_minutes:
        raise KPIInputError("Downtime cannot exceed planned production time.")
    if inputs.good_quantity > inputs.total_quantity:
        raise KPIInputError("Good quantity cannot exceed total quantity.")

    run_time = inputs.planned_production_minutes - inputs.downtime_minutes
    if not inputs.planned_production_minutes or not run_time or not inputs.total_quantity:
        raise KPIInputError("OEE denominators must be greater than zero.")

    availability = run_time / inputs.planned_production_minutes
    performance = (inputs.ideal_cycle_minutes * inputs.total_quantity) / run_time
    quality = inputs.good_quantity / inputs.total_quantity
    return OEEResult(
        availability=_bounded(availability),
        performance=_bounded(performance),
        quality=_bounded(quality),
        oee=_bounded(availability * performance * quality),
    )


def decimal(value: object) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError) as exc:
        raise KPIInputError(f"{value!r} is not a valid numeric input.") from exc


def _bounded(value: Decimal) -> Decimal:
    return min(max(value, Decimal(0)), Decimal(1)).quantize(Decimal("0.000001"))
