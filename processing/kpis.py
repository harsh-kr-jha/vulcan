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


@dataclass(frozen=True)
class SteamRecoveryInputs:
    """Aggregated boiler-house observations for one selected period.

    Heat recovered is deliberately derived from the measured feedwater-tank
    temperature lift.  Flash steam and condensate masses are reported as
    recovery indicators, but are not added to heat again (which would double
    count their contribution to the tank temperature).
    """

    feedwater_kg: Decimal
    feedwater_inlet_temperature_c: Decimal
    feedwater_tank_temperature_c: Decimal
    steam_generated_kg: Decimal
    recovered_condensate_kg: Decimal
    flash_steam_recovered_kg: Decimal
    briquette_used_kg: Decimal
    briquette_gcv_kcal_per_kg: Decimal
    boiler_efficiency_percent: Decimal
    production_quantity: Decimal


@dataclass(frozen=True)
class SteamRecoveryResult:
    temperature_lift_c: Decimal
    heat_recovered_mj: Decimal
    heat_recovered_gj: Decimal
    equivalent_briquette_saved_kg: Decimal
    condensate_recovery_percent: Decimal
    flash_steam_recovery_percent: Decimal
    specific_steam_kg_per_unit: Decimal
    specific_briquette_kg_per_tonne_steam: Decimal
    briquette_avoidance_percent: Decimal
    formula_version: str = "steam-recovery-v1"

    def as_dict(self) -> dict:
        return {
            "temperatureLiftC": float(self.temperature_lift_c),
            "heatRecoveredMj": float(self.heat_recovered_mj),
            "heatRecoveredGj": float(self.heat_recovered_gj),
            "equivalentBriquetteSavedKg": float(self.equivalent_briquette_saved_kg),
            "condensateRecoveryPercent": float(self.condensate_recovery_percent),
            "flashSteamRecoveryPercent": float(self.flash_steam_recovery_percent),
            "specificSteamKgPerUnit": float(self.specific_steam_kg_per_unit),
            "specificBriquetteKgPerTonneSteam": float(
                self.specific_briquette_kg_per_tonne_steam
            ),
            "briquetteAvoidancePercent": float(self.briquette_avoidance_percent),
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


def calculate_steam_recovery(inputs: SteamRecoveryInputs) -> SteamRecoveryResult:
    """Convert measured recovery into energy and avoided briquette consumption.

    Water specific heat is fixed at 4.186 kJ/kg.K and the kcal-to-kJ
    conversion at 4.1868.  GCV and boiler efficiency remain measured inputs so
    the fuel saving is plant-specific and auditable.
    """

    if any(value < 0 for value in vars(inputs).values()):
        raise KPIInputError("Steam recovery KPI inputs cannot be negative.")
    if inputs.boiler_efficiency_percent > 100:
        raise KPIInputError("Boiler efficiency cannot exceed 100 percent.")

    temperature_lift = max(
        inputs.feedwater_tank_temperature_c - inputs.feedwater_inlet_temperature_c,
        Decimal(0),
    )
    heat_recovered_mj = (
        inputs.feedwater_kg * Decimal("4.186") * temperature_lift / Decimal(1000)
    )
    useful_fuel_mj_per_kg = (
        inputs.briquette_gcv_kcal_per_kg
        * Decimal("4.1868")
        / Decimal(1000)
        * inputs.boiler_efficiency_percent
        / Decimal(100)
    )
    briquette_saved = _ratio(heat_recovered_mj, useful_fuel_mj_per_kg)
    briquette_without_recovery = inputs.briquette_used_kg + briquette_saved

    return SteamRecoveryResult(
        temperature_lift_c=temperature_lift.quantize(Decimal("0.001")),
        heat_recovered_mj=heat_recovered_mj.quantize(Decimal("0.001")),
        heat_recovered_gj=(heat_recovered_mj / Decimal(1000)).quantize(Decimal("0.001")),
        equivalent_briquette_saved_kg=briquette_saved,
        condensate_recovery_percent=_ratio_percent(
            inputs.recovered_condensate_kg, inputs.steam_generated_kg
        ),
        flash_steam_recovery_percent=_ratio_percent(
            inputs.flash_steam_recovered_kg, inputs.steam_generated_kg
        ),
        specific_steam_kg_per_unit=_ratio(
            inputs.steam_generated_kg, inputs.production_quantity
        ),
        specific_briquette_kg_per_tonne_steam=_ratio(
            inputs.briquette_used_kg * Decimal(1000), inputs.steam_generated_kg
        ),
        briquette_avoidance_percent=_ratio_percent(
            briquette_saved, briquette_without_recovery
        ),
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
