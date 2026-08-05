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


@dataclass(frozen=True)
class MushroomKPIInputs:
    """Auditable cultivation inputs aggregated for one selected period."""

    planned_harvest_kg: Decimal
    total_harvest_kg: Decimal
    saleable_harvest_kg: Decimal
    contaminated_harvest_kg: Decimal
    dry_substrate_kg: Decimal
    growing_area_m2: Decimal
    water_litres: Decimal
    compliant_environment_readings: Decimal
    total_environment_readings: Decimal
    crop_age_days_total: Decimal
    crop_batches: Decimal


@dataclass(frozen=True)
class MushroomKPIResult:
    plan_attainment: Decimal
    biological_efficiency: Decimal
    saleable_yield: Decimal
    contamination_rate: Decimal
    yield_per_m2: Decimal
    water_productivity_kg_per_kl: Decimal
    environment_compliance: Decimal
    average_crop_age_days: Decimal
    formula_version: str = "mushroom-kpis-v1"

    def as_dict(self) -> dict:
        return {
            "planAttainment": float(self.plan_attainment),
            "biologicalEfficiency": float(self.biological_efficiency),
            "saleableYield": float(self.saleable_yield),
            "contaminationRate": float(self.contamination_rate),
            "yieldPerM2": float(self.yield_per_m2),
            "waterProductivityKgPerKl": float(self.water_productivity_kg_per_kl),
            "environmentCompliance": float(self.environment_compliance),
            "averageCropAgeDays": float(self.average_crop_age_days),
            "formulaVersion": self.formula_version,
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


def calculate_mushroom_kpis(inputs: MushroomKPIInputs) -> MushroomKPIResult:
    """Calculate mushroom-farm KPIs without inventing missing denominators."""

    values = vars(inputs)
    if any(value < 0 for value in values.values()):
        raise KPIInputError("Mushroom KPI inputs cannot be negative.")
    if inputs.saleable_harvest_kg > inputs.total_harvest_kg:
        raise KPIInputError("Saleable harvest cannot exceed total harvest.")
    if inputs.contaminated_harvest_kg > inputs.total_harvest_kg:
        raise KPIInputError("Contaminated harvest cannot exceed total harvest.")
    if inputs.compliant_environment_readings > inputs.total_environment_readings:
        raise KPIInputError("Compliant readings cannot exceed total environment readings.")

    return MushroomKPIResult(
        plan_attainment=_ratio_percent(inputs.total_harvest_kg, inputs.planned_harvest_kg),
        biological_efficiency=_ratio_percent(inputs.total_harvest_kg, inputs.dry_substrate_kg),
        saleable_yield=_ratio_percent(inputs.saleable_harvest_kg, inputs.total_harvest_kg),
        contamination_rate=_ratio_percent(inputs.contaminated_harvest_kg, inputs.total_harvest_kg),
        yield_per_m2=_ratio(inputs.saleable_harvest_kg, inputs.growing_area_m2),
        water_productivity_kg_per_kl=_ratio(
            inputs.saleable_harvest_kg, inputs.water_litres / Decimal(1000)
        ),
        environment_compliance=_ratio_percent(
            inputs.compliant_environment_readings,
            inputs.total_environment_readings,
        ),
        average_crop_age_days=_ratio(inputs.crop_age_days_total, inputs.crop_batches),
    )


def decimal(value: object) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError) as exc:
        raise KPIInputError(f"{value!r} is not a valid numeric input.") from exc


def _bounded(value: Decimal) -> Decimal:
    return min(max(value, Decimal(0)), Decimal(1)).quantize(Decimal("0.000001"))


def _ratio(numerator: Decimal, denominator: Decimal) -> Decimal:
    if not denominator:
        return Decimal(0).quantize(Decimal("0.000001"))
    return (numerator / denominator).quantize(Decimal("0.000001"))


def _ratio_percent(numerator: Decimal, denominator: Decimal) -> Decimal:
    if not denominator:
        return Decimal(0).quantize(Decimal("0.000001"))
    return ((numerator / denominator) * Decimal(100)).quantize(Decimal("0.000001"))
