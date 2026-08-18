# Platform Core – Shared analytics framework.
# Industry-specific KPIs and workflows are provided by operating template branches.

import hashlib
from collections import defaultdict
from contextlib import suppress
from datetime import date, timedelta
from decimal import Decimal
from threading import Lock
from uuid import uuid4

from django.conf import settings
from django.core.cache import cache
from django.db.models import Q

from apps.operations.imports import serialize_upload
from apps.operations.models import StandardRecord, Upload
from apps.tenancy.serializers import FactoryMasterSerializer, WorkspaceFactorySerializer
from processing.kpis import (
    SteamRecoveryInputs,
    calculate_steam_recovery,
)

DEFAULT_TARGETS = {
    "oee": 78,
    "availability": 85,
    "performance": 95,
    "quality": 98,
    "planAttainment": 90,
    "rejectionRate": 5,
    "supplierScore": 85,
    "stockCoverDays": 3,
    "downtimeMinutes": 30,
    "downtimeUnit": "minutes",
}

NUMERIC_TARGETS = set(DEFAULT_TARGETS) - {"downtimeUnit"}

# Mushroom cultivation project workflow stages.
DEFAULT_PROJECT_WORKFLOW = [
    "Compost Preparation",
    "Pasteurisation & Conditioning",
    "Spawning",
    "Spawn Run",
    "Casing",
    "Pinning",
    "Cropping & Harvest",
    "Packing & Cold Room",
]

_workspace_lock_guard = Lock()
_workspace_locks = {}


def workspace_lock(factory_id):
    """Return one process-local build lock per factory.

    The GCE showcase intentionally runs one Gunicorn worker with threads. A
    process-local lock therefore prevents duplicate cold-cache calculations
    without adding Redis to the lightweight deployment.
    """
    key = str(factory_id)
    with _workspace_lock_guard:
        return _workspace_locks.setdefault(key, Lock())


def normalise_targets(current, updates):
    """Keep threshold calculations canonical while validating display preferences."""
    if not isinstance(updates, dict):
        raise ValueError("Targets must be provided as an object.")
    unknown = set(updates) - set(DEFAULT_TARGETS)
    if unknown:
        raise ValueError(f"Unsupported target: {sorted(unknown)[0]}.")
    result = {**DEFAULT_TARGETS, **(current if isinstance(current, dict) else {})}
    for key in NUMERIC_TARGETS:
        if key not in updates:
            continue
        value = updates[key]
        if isinstance(value, bool):
            raise ValueError(f"{key} must be a number.")
        try:
            numeric = float(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"{key} must be a number.") from exc
        if numeric < 0:
            raise ValueError(f"{key} cannot be negative.")
        result[key] = numeric
    if "downtimeUnit" in updates:
        unit = str(updates["downtimeUnit"]).strip().lower()
        if unit not in {"minutes", "hours"}:
            raise ValueError("Downtime unit must be minutes or hours.")
        result["downtimeUnit"] = unit
    return result


def duration_label(minutes):
    """Use minutes for short losses and hours once a duration reaches 60 minutes."""
    value = number(minutes)
    if abs(value) >= 60:
        hours = value / 60
        return f"{hours:.1f}".rstrip("0").rstrip(".") + " hr"
    return f"{value:g} min"


CUSTOM_KPI_VARIABLES = {
    "production.planned": ("Planned output", "Production", "units"),
    "production.actual": ("Actual output", "Production", "units"),
    "production.good": ("Accepted output", "Production", "units"),
    "production.run_minutes": ("Run time", "Production", "minutes"),
    "downtime.minutes": ("Downtime", "Downtime", "minutes"),
    "downtime.occurrences": ("Stoppages", "Downtime", "stops"),
    "quality.inspected": ("Inspected quantity", "Quality", "units"),
    "quality.rejected": ("Rejected quantity", "Quality", "units"),
    "quality.reworked": ("Reworked quantity", "Quality", "units"),
    "inventory.risk_count": ("Materials at risk", "Inventory", "materials"),
    "supplier.score": ("Supplier score", "Supplier deliveries", "points"),
    "supplier.deliveries": ("Supplier deliveries", "Supplier deliveries", "deliveries"),
    "supplier.late_deliveries": ("Late deliveries", "Supplier deliveries", "deliveries"),
    "orders.at_risk": ("Orders at risk", "Orders", "orders"),
    "utilities.steam_generated": ("Steam generated", "Steam & boiler utilities", "kg"),
    "utilities.briquette_used": ("Briquettes used", "Steam & boiler utilities", "kg"),
    "utilities.heat_recovered": ("Heat recovered", "Steam & boiler utilities", "MJ"),
    "utilities.briquette_saved": ("Equivalent briquettes saved", "Steam & boiler utilities", "kg"),
}


def workspace_snapshot(identity, factory, filters):
    # Short-lived per-factory+filters cache to avoid recomputing heavy aggregates
    version = cache.get(f"workspace:version:{factory.id}", 1)
    from_val = str(filters.get("from", ""))
    to_val = str(filters.get("to", ""))
    dimensions = ":".join(
        str(filters.get(name, "all")) for name in ("line", "machine", "sku", "shift")
    )
    key = f"workspace:v{version}:{factory.id}:{from_val}:{to_val}:{dimensions}"
    cached = cache.get(key)
    if cached is not None:
        return cached

    with workspace_lock(factory.id):
        # Another request may have completed the same cold build while this
        # thread waited for the per-factory lock.
        cached = cache.get(key)
        if cached is not None:
            return cached
        snapshot = build_workspace_snapshot(identity, factory, filters, targets=None)
        ttl = getattr(settings, "WORKSPACE_CACHE_TTL", 300)
        with suppress(Exception):
            cache.set(key, snapshot, ttl)
        return snapshot


def build_workspace_snapshot(identity, factory, filters, targets=None):
    targets = targets or {**DEFAULT_TARGETS, **factory.configuration.get("targets", {})}

    intelligence = build_intelligence(factory, targets, filters)
    masters = {
        kind: []
        for kind in [
            "lines",
            "processes",
            "machines",
            "skus",
            "materials",
            "suppliers",
            "shifts",
            "reasonCodes",
        ]
    }
    for item in factory.master_records.select_related("parent").order_by("kind", "name"):
        masters[item.kind].append(FactoryMasterSerializer(item).data)
    # Draft inspection, mapping and validation rows are implementation details of
    # the open dialog. A source becomes part of factory history only after the
    # operator explicitly imports its valid rows.
    uploads = [
        serialize_upload(item)
        for item in Upload.objects.filter(factory=factory, status="COMPLETED")[:100]
    ]
    actions = [
        {
            "id": str(item.id),
            "alertId": item.alert_key,
            "title": item.title,
            "owner": item.owner,
            "dueDate": item.due_date.isoformat(),
            "status": item.status,
            "createdAt": item.created_at.isoformat(),
        }
        for item in factory.action_items.all()
    ]
    snapshot = {
        "state": {
            "company": {
                "id": str(identity.company.id),
                "name": identity.company.name,
                "industry": factory.configuration.get("industry", ""),
            },
            "factories": WorkspaceFactorySerializer(
                identity.factories(), many=True
            ).data,
            "activeFactoryId": str(factory.id),
            "masters": masters,
            "uploads": uploads,
            "actions": actions,
            "targets": targets,
        },
        "intelligence": intelligence,
    }
    return snapshot


def workspace_record_rows(factory, from_date, to_date):
    """Stream only rows that can affect the selected workspace period.

    Inventory and process data need history up to the selected end, while
    projects and orders have their own later date semantics. Ordinary fact
    datasets can be bounded at SQLite before their JSON payload reaches Python.
    """
    bounded_history_types = {"inventory", "process"}
    unbounded_types = {"orders", "projects", "project_stages"}
    period_types = {"production", "downtime", "quality", "utilities", "supplier"}
    period = Q(dataset_type__in=period_types)
    if from_date:
        period &= Q(operational_date__isnull=True) | Q(operational_date__gte=from_date)
    if to_date:
        period &= Q(operational_date__isnull=True) | Q(operational_date__lte=to_date)

    history = Q(dataset_type__in=bounded_history_types)
    if to_date:
        history &= Q(operational_date__isnull=True) | Q(operational_date__lte=to_date)

    return (
        StandardRecord.objects.filter(factory=factory)
        .filter(period | history | Q(dataset_type__in=unbounded_types))
        .values(
            "dataset_type",
            "operational_date",
            "values",
            "source_row",
            "upload__created_at",
            "upload__original_filename",
        )
        .iterator(chunk_size=500)
    )


def build_intelligence(factory, targets, filters):
    from_date = parse_date(filters.get("from"))
    to_date = parse_date(filters.get("to"))
    # Some datasets describe state at or beyond the selected period (for example,
    # inventory history, project stages, and orders due after the range). Apply
    # their date semantics below instead of dropping them in one global DB filter.
    production = []
    downtime = []
    quality = []
    utilities = []
    inventory_history = []
    process_history = []
    orders = []
    supplier_deliveries = []
    project_records = []
    project_stage_records = []
    latest_dates = {}
    for record in workspace_record_rows(factory, from_date, to_date):
        value = record["values"]
        dataset_type = record["dataset_type"]
        operational_date = record["operational_date"]
        if (
            operational_date
            and (not to_date or operational_date <= to_date)
            and (
                dataset_type not in latest_dates
                or operational_date > latest_dates[dataset_type]
            )
        ):
            latest_dates[dataset_type] = operational_date
        if dataset_type == "projects":
            project_records.append(record)
            continue
        if dataset_type == "project_stages":
            project_stage_records.append(record)
            continue
        if dataset_type == "inventory":
            inventory_history.append(value)
            continue
        if dataset_type == "process":
            process_history.append(value)
            continue
        if dataset_type == "orders":
            orders.append(value)
            continue
        if dataset_type == "supplier":
            supplier_deliveries.append(value)
            continue
        if not matches_dimensions(value, filters):
            continue
        if dataset_type == "production":
            production.append(value)
        elif dataset_type == "downtime":
            downtime.append(value)
        elif dataset_type == "quality":
            quality.append(value)
        elif dataset_type == "utilities":
            utilities.append(value)
    process_runs = process_history
    orders = [value for value in orders if matches_dimensions(value, filters, include_shift=False)]
    inventory = latest_inventory(inventory_history)
    supplier_scores = build_supplier_scores(supplier_deliveries)
    supplier_score = (
        sum(item["score"] * item["deliveries"] for item in supplier_scores)
        / sum(item["deliveries"] for item in supplier_scores)
        if supplier_scores
        else 0
    )
    projects = build_projects(project_records, project_stage_records, filters.get("to"))

    planned = total(production, "planned_quantity")
    actual = total(production, "actual_quantity")
    good = total(production, "good_quantity")
    rejected = total(production, "rejected_quantity")
    reworked = total(production, "reworked_quantity")
    planned_minutes = total(production, "planned_minutes")
    recorded_downtime = total(production, "downtime_minutes")
    production_downtime = recorded_downtime or total(downtime, "minutes")
    downtime_frequency = sum(number(row.get("occurrences"), 1) for row in downtime)
    run_minutes = max(planned_minutes - production_downtime, 0)
    ideal_minutes = sum(
        number(row.get("ideal_cycle_minutes")) * number(row.get("actual_quantity"))
        for row in production
    )
    availability = min(percent(run_minutes, planned_minutes), 100)
    performance = min(percent(ideal_minutes, run_minutes), 100)
    quality_rate = min(percent(good, actual), 100)
    oee = availability * performance * quality_rate / 10_000
    weighted_ideal_cycle = ideal_minutes / actual if actual else 0
    actual_cycle = run_minutes / actual if actual else 0
    throughput_rate = actual / run_minutes * 60 if run_minutes else 0
    cycle_time_variance = (
        percent(actual_cycle - weighted_ideal_cycle, weighted_ideal_cycle)
        if weighted_ideal_cycle
        else 0
    )
    downtime_lost_units = production_downtime / weighted_ideal_cycle if weighted_ideal_cycle else 0
    speed_lost_units = (
        max(run_minutes / weighted_ideal_cycle - actual, 0) if weighted_ideal_cycle else 0
    )

    inspected = total(quality, "inspected_quantity")
    quality_rejected = total(quality, "rejected_quantity")
    quality_reworked = total(quality, "reworked_quantity")
    rejection_rate = (
        percent(quality_rejected, inspected) if inspected else percent(rejected, actual)
    )
    rework_rate = percent(quality_reworked, inspected) if inspected else percent(reworked, actual)
    first_pass_yield = (
        percent(max(inspected - quality_rejected - quality_reworked, 0), inspected)
        if inspected
        else quality_rate
    )

    # Industry-specific KPIs are empty at the platform level — template branches populate these.
    mushroom_kpis = {}

    steam_recovery = build_steam_recovery(utilities, production)
    trend, daily_oee = production_trends(production)
    machine_loss = grouped_loss(downtime, "machine", include_line=True)
    reason_loss = grouped_loss(downtime, "reason")
    defect_loss = grouped_quality(quality, "defect_reason")
    sku_quality = grouped_sku_quality(quality)
    inventory_risks = build_inventory_risks(inventory, filters.get("to"), targets)
    order_risks = build_order_risks(
        orders, filters.get("to"), good / max(len(trend), 1), machine_loss
    )
    losses = {
        "productionGapUnits": max(planned - actual, 0),
        "downtimeLostUnits": downtime_lost_units,
        "speedLostUnits": speed_lost_units,
        "rejectedUnits": quality_rejected if inspected else rejected,
        "reworkUnits": quality_reworked if inspected else reworked,
    }
    alerts = generated_alerts(
        factory,
        filters,
        targets,
        oee,
        planned,
        actual,
        machine_loss,
        defect_loss,
        inventory_risks,
        order_risks,
        supplier_scores,
        rejection_rate,
    )
    alerts = project_alerts(factory, projects, filters.get("to")) + alerts
    uploads = Upload.objects.filter(factory=factory, status="COMPLETED")
    uploaded_types = set(uploads.values_list("dataset_type", flat=True))
    upload_count = uploads.count()
    quality_score = (
        sum(float(item.data_quality_score) for item in uploads) / upload_count
        if upload_count
        else 100
    )
    custom_variables = build_custom_kpi_variables(
        planned,
        actual,
        good,
        run_minutes,
        production_downtime,
        downtime_frequency,
        inspected,
        quality_rejected if inspected else rejected,
        quality_reworked if inspected else reworked,
        inventory_risks,
        supplier_score,
        supplier_scores,
        order_risks,
        steam_recovery,
    )
    custom_kpis = calculate_custom_kpis(
        factory.configuration.get("customKpis", []), custom_variables
    )
    digital_twin = build_digital_twin(factory, process_runs)
    return {
        "totals": {
            "planned": planned,
            "actual": actual,
            "good": good,
            "rejected": quality_rejected if inspected else rejected,
            "reworked": quality_reworked if inspected else reworked,
            "planAttainment": percent(actual, planned),
            "firstPassYield": first_pass_yield,
            "totalDowntime": production_downtime,
            "downtimeFrequency": downtime_frequency,
            "averageDowntimeDuration": (
                production_downtime / downtime_frequency if downtime_frequency else 0
            ),
            "rejectionRate": rejection_rate,
            "reworkRate": rework_rate,
            "estimatedProductionLost": max(planned - actual, 0),
            "throughputRate": throughput_rate,
            "idealCycleMinutes": weighted_ideal_cycle,
            "actualCycleMinutes": actual_cycle,
            "cycleTimeVariance": cycle_time_variance,
        },
        "oee": {
            "availability": availability,
            "performance": performance,
            "quality": quality_rate,
            "value": oee,
            "plannedMinutes": planned_minutes,
            "runMinutes": run_minutes,
            "idealMinutes": ideal_minutes,
        },
        "dailyOee": daily_oee,
        "productionTrend": trend,
        "machineLoss": machine_loss,
        "reasonLoss": reason_loss,
        "defectLoss": defect_loss,
        "skuQuality": sku_quality,
        "inventoryRisks": inventory_risks,
        "orderRisks": order_risks,
        "supplierScores": supplier_scores,
        "supplierScore": supplier_score,
        "mushroom": mushroom_kpis,
        "roomConditions": [],
        "steamRecovery": steam_recovery,
        "customKpiVariables": custom_variables,
        "customKpis": custom_kpis,
        "digitalTwin": digital_twin,
        "projects": projects,
        "losses": losses,
        "dataAvailability": {
            "production": len(production),
            "downtime": len(downtime),
            "quality": len(quality),
            "inventory": len(inventory),
            "supplier": len(supplier_deliveries),
            "orders": len(orders),
            "process": len(process_runs),
            "projects": len(projects),
            "project_stages": len(latest_project_values(project_stage_records, stage_record_key)),
            "utilities": len(utilities),
        },
        "dataHealth": build_data_health(latest_dates, uploaded_types, to_date),
        "alerts": alerts,
        "dataQuality": quality_score,
    }


def normalise_custom_kpis(value):
    if not isinstance(value, list):
        raise ValueError("Custom KPIs must be provided as a list.")
    if len(value) > 12:
        raise ValueError("A factory can have up to 12 custom KPIs.")
    result = []
    seen_ids = set()
    for item in value:
        if not isinstance(item, dict):
            raise ValueError("Every custom KPI must be an object.")
        name = str(item.get("name", "")).strip()[:60]
        variable_a = str(item.get("variableA", ""))
        variable_b = str(item.get("variableB", ""))
        operation = str(item.get("operation", "divide"))
        if not name:
            raise ValueError("Every custom KPI needs a name.")
        if variable_a not in CUSTOM_KPI_VARIABLES or variable_b not in CUSTOM_KPI_VARIABLES:
            raise ValueError("Choose supported variables for every custom KPI.")
        if operation not in {"add", "subtract", "multiply", "divide"}:
            raise ValueError("Choose a supported custom KPI operation.")
        try:
            scale = int(item.get("scale", 1))
            decimals = int(item.get("decimals", 1))
        except (TypeError, ValueError) as exc:
            raise ValueError("Custom KPI scale and decimals must be numbers.") from exc
        if scale not in {1, 100} or decimals not in {0, 1, 2, 3}:
            raise ValueError("Choose a valid scale and decimal precision.")
        item_id = str(item.get("id") or uuid4())[:80]
        if item_id in seen_ids:
            raise ValueError("Custom KPI identifiers must be unique.")
        seen_ids.add(item_id)
        result.append(
            {
                "id": item_id,
                "name": name,
                "variableA": variable_a,
                "operation": operation,
                "variableB": variable_b,
                "scale": scale,
                "decimals": decimals,
                "unit": str(item.get("unit", "")).strip()[:20],
                "pinnedToHome": bool(item.get("pinnedToHome", False)),
            }
        )
    return result


def build_custom_kpi_variables(
    planned,
    actual,
    good,
    run_minutes,
    downtime_minutes,
    downtime_frequency,
    inspected,
    rejected,
    reworked,
    inventory_risks,
    supplier_score,
    supplier_scores,
    order_risks,
    steam_recovery,
):
    values = {
        "production.planned": planned,
        "production.actual": actual,
        "production.good": good,
        "production.run_minutes": run_minutes,
        "downtime.minutes": downtime_minutes,
        "downtime.occurrences": downtime_frequency,
        "quality.inspected": inspected,
        "quality.rejected": rejected,
        "quality.reworked": reworked,
        "inventory.risk_count": len(inventory_risks),
        "supplier.score": supplier_score,
        "supplier.deliveries": sum(item["deliveries"] for item in supplier_scores),
        "supplier.late_deliveries": sum(item["lateDeliveries"] for item in supplier_scores),
        "orders.at_risk": len(order_risks),
        "utilities.steam_generated": steam_recovery["steamGeneratedKg"],
        "utilities.briquette_used": steam_recovery["briquetteUsedKg"],
        "utilities.heat_recovered": steam_recovery["heatRecoveredMj"],
        "utilities.briquette_saved": steam_recovery["equivalentBriquetteSavedKg"],
    }
    variables = CUSTOM_KPI_VARIABLES
    return [
        {
            "key": key,
            "label": label,
            "dataset": dataset,
            "sourceUnit": unit,
            "value": values[key],
        }
        for key, (label, dataset, unit) in variables.items()
    ]


def build_steam_recovery(utility_rows, production_rows):
    """Build period and daily boiler KPIs from approved utility log rows."""

    feedwater_kg = total(utility_rows, "feedwater_kg")
    steam_generated_kg = total(utility_rows, "steam_generated_kg")
    briquette_used_kg = total(utility_rows, "briquette_used_kg")

    def weighted(field, weight_field):
        denominator = total(utility_rows, weight_field)
        return (
            sum(number(row.get(field)) * number(row.get(weight_field)) for row in utility_rows)
            / denominator
            if denominator
            else 0
        )

    result = calculate_steam_recovery(
        SteamRecoveryInputs(
            feedwater_kg=Decimal(str(feedwater_kg)),
            feedwater_inlet_temperature_c=Decimal(
                str(weighted("feedwater_inlet_temperature_c", "feedwater_kg"))
            ),
            feedwater_tank_temperature_c=Decimal(
                str(weighted("feedwater_tank_temperature_c", "feedwater_kg"))
            ),
            steam_generated_kg=Decimal(str(steam_generated_kg)),
            recovered_condensate_kg=Decimal(
                str(total(utility_rows, "recovered_condensate_kg"))
            ),
            flash_steam_recovered_kg=Decimal(
                str(total(utility_rows, "flash_steam_recovered_kg"))
            ),
            briquette_used_kg=Decimal(str(briquette_used_kg)),
            briquette_gcv_kcal_per_kg=Decimal(
                str(weighted("briquette_gcv_kcal_per_kg", "briquette_used_kg"))
            ),
            boiler_efficiency_percent=Decimal(
                str(weighted("boiler_efficiency_percent", "briquette_used_kg"))
            ),
            production_quantity=Decimal(str(total(production_rows, "actual_quantity"))),
        )
    ).as_dict()
    result.update(
        {
            "feedwaterKg": feedwater_kg,
            "steamGeneratedKg": steam_generated_kg,
            "recoveredCondensateKg": total(utility_rows, "recovered_condensate_kg"),
            "flashSteamRecoveredKg": total(utility_rows, "flash_steam_recovered_kg"),
            "briquetteUsedKg": briquette_used_kg,
            "boilerEfficiencyPercent": weighted(
                "boiler_efficiency_percent", "briquette_used_kg"
            ),
            "briquetteGcvKcalPerKg": weighted(
                "briquette_gcv_kcal_per_kg", "briquette_used_kg"
            ),
        }
    )

    utility_by_date = defaultdict(list)
    production_by_date = defaultdict(list)
    for row in utility_rows:
        utility_by_date[str(row.get("date", ""))].append(row)
    for row in production_rows:
        production_by_date[str(row.get("date", ""))].append(row)
    result["trend"] = []
    for day in sorted(key for key in utility_by_date if key):
        daily = build_steam_recovery_without_trend(
            utility_by_date[day], production_by_date.get(day, [])
        )
        result["trend"].append(
            {
                "date": day,
                "steamGeneratedKg": daily["steamGeneratedKg"],
                "briquetteUsedKg": daily["briquetteUsedKg"],
                "heatRecoveredMj": daily["heatRecoveredMj"],
                "specificSteamKgPerUnit": daily["specificSteamKgPerUnit"],
            }
        )
    return result


def build_steam_recovery_without_trend(utility_rows, production_rows):
    """Calculate one daily point without recursively building another trend."""

    feedwater = total(utility_rows, "feedwater_kg")
    fuel = total(utility_rows, "briquette_used_kg")

    def weighted(field, weight_field, denominator):
        return (
            sum(number(row.get(field)) * number(row.get(weight_field)) for row in utility_rows)
            / denominator
            if denominator
            else 0
        )

    calculated = calculate_steam_recovery(
        SteamRecoveryInputs(
            feedwater_kg=Decimal(str(feedwater)),
            feedwater_inlet_temperature_c=Decimal(
                str(weighted("feedwater_inlet_temperature_c", "feedwater_kg", feedwater))
            ),
            feedwater_tank_temperature_c=Decimal(
                str(weighted("feedwater_tank_temperature_c", "feedwater_kg", feedwater))
            ),
            steam_generated_kg=Decimal(str(total(utility_rows, "steam_generated_kg"))),
            recovered_condensate_kg=Decimal(str(total(utility_rows, "recovered_condensate_kg"))),
            flash_steam_recovered_kg=Decimal(str(total(utility_rows, "flash_steam_recovered_kg"))),
            briquette_used_kg=Decimal(str(fuel)),
            briquette_gcv_kcal_per_kg=Decimal(
                str(weighted("briquette_gcv_kcal_per_kg", "briquette_used_kg", fuel))
            ),
            boiler_efficiency_percent=Decimal(
                str(weighted("boiler_efficiency_percent", "briquette_used_kg", fuel))
            ),
            production_quantity=Decimal(str(total(production_rows, "actual_quantity"))),
        )
    ).as_dict()
    calculated.update(
        {
            "steamGeneratedKg": total(utility_rows, "steam_generated_kg"),
            "briquetteUsedKg": fuel,
        }
    )
    return calculated


def calculate_custom_kpis(definitions, variables):
    variable_lookup = {item["key"]: item for item in variables}
    operators = {
        "add": ("+", lambda left, right: left + right),
        "subtract": ("−", lambda left, right: left - right),
        "multiply": ("×", lambda left, right: left * right),
        "divide": ("÷", lambda left, right: left / right if right else None),
    }
    result = []
    for definition in definitions if isinstance(definitions, list) else []:
        try:
            clean = normalise_custom_kpis([definition])[0]
            left = variable_lookup[clean["variableA"]]
            right = variable_lookup[clean["variableB"]]
            symbol, operation = operators[clean["operation"]]
            calculated = operation(number(left["value"]), number(right["value"]))
            calculated = calculated * clean["scale"] if calculated is not None else None
            result.append(
                {
                    **clean,
                    "value": round(calculated, clean["decimals"])
                    if calculated is not None
                    else None,
                    "status": "ready" if calculated is not None else "unavailable",
                    "formulaLabel": (
                        f"{left['label']} {symbol} {right['label']}"
                        f"{' × 100' if clean['scale'] == 100 else ''}"
                    ),
                    "datasets": sorted({left["dataset"], right["dataset"]}),
                }
            )
        except (KeyError, TypeError, ValueError):
            continue
    return result


def build_digital_twin(factory, process_runs):
    masters = list(
        factory.master_records.filter(
            is_active=True, kind__in=["lines", "processes", "machines"]
        ).order_by("name")
    )
    lines = [item for item in masters if item.kind == "lines"]
    process_masters = [item for item in masters if item.kind == "processes"]
    machine_masters = [item for item in masters if item.kind == "machines"]
    details = factory.configuration.get("factoryDetails", {})

    def machines_for(process):
        direct = [item for item in machine_masters if item.parent_id == process.id]
        process_codes = {process.name.casefold(), process.code.casefold()}
        return direct + [
            item
            for item in machine_masters
            if item not in direct
            and str(item.metadata.get("processCode", "")).casefold() in process_codes
        ]

    def rows_for_process(process, machines):
        names = {process.name.casefold(), process.code.casefold()}
        machine_names = {
            value
            for machine in machines
            for value in [machine.name.casefold(), machine.code.casefold()]
        }
        return [
            row
            for row in process_runs
            if str(row.get("process", "")).casefold() in names
            or str(row.get("machine", "")).casefold() in machine_names
        ]

    line_payloads = []
    for line in lines:
        line_processes = [item for item in process_masters if item.parent_id == line.id]
        line_processes.sort(
            key=lambda item: (number(item.metadata.get("sequence"), 999), item.name)
        )
        if not line_processes:
            direct_machines = [item for item in machine_masters if item.parent_id == line.id]
            line_processes = direct_machines

        process_payloads = []
        for sequence, process in enumerate(line_processes, start=1):
            is_machine_fallback = process.kind == "machines"
            machines = [process] if is_machine_fallback else machines_for(process)
            matching_rows = rows_for_process(process, machines)
            latest_rows = latest_process_rows(matching_rows)
            machine_payloads = [
                build_twin_machine(machine, latest_rows, process.metadata) for machine in machines
            ]
            metrics = process_metrics(latest_rows)
            status = twin_status(latest_rows, machine_payloads)
            metadata = process.metadata or {}
            latest_date = max((str(row.get("date", "")) for row in latest_rows), default="")
            reported_on = parse_date(latest_date)
            data_age_days = max((date.today() - reported_on).days, 0) if reported_on else None
            process_payloads.append(
                {
                    "id": str(process.id),
                    "name": metadata.get("processName", process.name)
                    if is_machine_fallback
                    else process.name,
                    "code": process.code,
                    "sequence": int(number(metadata.get("sequence"), sequence)),
                    "description": metadata.get("description", "Configured production stage"),
                    "processType": metadata.get("processType", "manufacturing"),
                    "inputUnit": metadata.get("inputUnit", details.get("productionUnit", "units")),
                    "outputUnit": metadata.get(
                        "outputUnit", details.get("productionUnit", "units")
                    ),
                    "targetCycleMinutes": optional_number(metadata.get("targetCycleMinutes")),
                    "targetTemperatureC": optional_number(metadata.get("targetTemperatureC")),
                    "targetPressureBar": optional_number(metadata.get("targetPressureBar")),
                    "capacityPerHour": optional_number(metadata.get("capacityPerHour")),
                    "status": status,
                    "latestDate": latest_date,
                    "dataAgeDays": data_age_days,
                    "dataStatus": (
                        "absent"
                        if data_age_days is None
                        else "stale"
                        if data_age_days > 2
                        else "current"
                    ),
                    "hasData": bool(latest_rows),
                    "metrics": metrics,
                    "machines": machine_payloads,
                }
            )

        process_payloads.sort(key=lambda item: (item["sequence"], item["name"]))
        line_payloads.append(
            {
                "id": str(line.id),
                "name": line.name,
                "code": line.code,
                "status": worst_twin_status([item["status"] for item in process_payloads]),
                "processes": process_payloads,
            }
        )

    all_processes = [process for line in line_payloads for process in line["processes"]]
    return {
        "factory": {
            "id": str(factory.id),
            "name": factory.name,
            "code": factory.code,
            "location": factory.address,
            "details": details,
        },
        "summary": {
            "lines": len(line_payloads),
            "processes": len(all_processes),
            "machines": sum(len(item["machines"]) for item in all_processes),
            "running": sum(item["status"] == "running" for item in all_processes),
            "attention": sum(item["status"] in {"warning", "down"} for item in all_processes),
            "withoutData": sum(not item["hasData"] for item in all_processes),
        },
        "lines": line_payloads,
    }


def latest_process_rows(rows):
    if not rows:
        return []
    latest = max((str(row.get("date", "")) for row in rows), default="")
    return [row for row in rows if str(row.get("date", "")) == latest]


def process_metrics(rows):
    input_quantity = total(rows, "input_quantity")
    output_quantity = total(rows, "output_quantity")
    rejected_quantity = optional_total(rows, "rejected_quantity")
    run_minutes = optional_total(rows, "run_minutes")
    return {
        "input": input_quantity,
        "output": output_quantity,
        "rejected": rejected_quantity,
        # Rejected quantity uses the process output unit. Comparing output to input
        # would be invalid for transforming stages such as kg -> metres.
        "yieldRate": (
            percent(max(output_quantity - rejected_quantity, 0), output_quantity)
            if rejected_quantity is not None and output_quantity
            else None
        ),
        "throughputPerHour": (output_quantity / run_minutes * 60 if run_minutes else None),
        "cycleMinutes": average(rows, "cycle_time_minutes"),
        "temperatureC": average(rows, "temperature_c"),
        "humidityPct": average(rows, "humidity_pct"),
        "co2Ppm": average(rows, "co2_ppm"),
        "substrateMoisturePct": average(rows, "substrate_moisture_pct"),
        "waterLitres": optional_total(rows, "water_litres"),
        "pressureBar": average(rows, "pressure_bar"),
        "energyKwh": optional_total(rows, "energy_kwh"),
        "downtimeMinutes": optional_total(rows, "downtime_minutes"),
    }


def build_twin_machine(machine, process_rows, process_metadata):
    names = {machine.name.casefold(), machine.code.casefold()}
    rows = [row for row in process_rows if str(row.get("machine", "")).casefold() in names]
    rows = latest_process_rows(rows)
    return {
        "id": str(machine.id),
        "name": machine.name,
        "code": machine.code,
        "status": twin_status(rows, []),
        "manufacturer": machine.metadata.get("manufacturer", ""),
        "model": machine.metadata.get("model", ""),
        "powerKw": number(machine.metadata.get("powerKw")),
        "capacityPerHour": number(
            machine.metadata.get("capacityPerHour", process_metadata.get("capacityPerHour", 0))
        ),
        "metrics": process_metrics(rows),
    }


def twin_status(rows, machines):
    explicit = [str(row.get("status", "")).strip().casefold() for row in rows]
    normalized = []
    for value in explicit:
        if not value:
            continue
        if value in {
            "down",
            "stopped",
            "fault",
            "offline",
            "blocked",
            "error",
            "critical",
        }:
            normalized.append("down")
        elif value in {"warning", "attention", "degraded"}:
            normalized.append("warning")
        elif value in {"idle", "standby", "maintenance", "planned stop"}:
            normalized.append("idle")
        elif value in {"running", "active", "operating"}:
            normalized.append("running")
        else:
            normalized.append("warning")
    normalized.extend(item["status"] for item in machines)
    if not rows and not machines:
        return "no_data"
    if not normalized:
        metrics = process_metrics(rows)
        if (metrics["downtimeMinutes"] or 0) > 0:
            return "warning"
        return "running"
    return worst_twin_status(normalized)


def worst_twin_status(statuses):
    priority = {"down": 0, "warning": 1, "idle": 2, "running": 3, "no_data": 4}
    return min(statuses, key=lambda item: priority.get(item, 4)) if statuses else "no_data"


def average(rows, key):
    values = [number(row.get(key)) for row in rows if row.get(key) not in {None, ""}]
    return sum(values) / len(values) if values else None


def matches_dimensions(value, filters, include_shift=True):
    keys = ["line", "machine", "sku"] + (["shift"] if include_shift else [])
    return all(filters.get(key, "all") in {"", "all", value.get(key)} for key in keys)


def production_trends(rows):
    grouped = defaultdict(list)
    for row in rows:
        grouped[str(row.get("date", ""))].append(row)
    trend = []
    daily_oee = []
    for day, values in sorted(grouped.items()):
        planned = total(values, "planned_quantity")
        actual = total(values, "actual_quantity")
        good = total(values, "good_quantity")
        planned_minutes = total(values, "planned_minutes")
        run = max(planned_minutes - total(values, "downtime_minutes"), 0)
        ideal = sum(
            number(row.get("ideal_cycle_minutes")) * number(row.get("actual_quantity"))
            for row in values
        )
        value = percent(run, planned_minutes) * percent(ideal, run) * percent(good, actual) / 10_000
        trend.append({"date": day, "planned": planned, "actual": actual, "good": good})
        daily_oee.append({"date": day, "value": value})
    return trend, daily_oee


def grouped_loss(rows, key, include_line=False):
    grouped = {}
    for row in rows:
        name = str(row.get(key) or "Unclassified")
        item = grouped.setdefault(
            name,
            {
                key: name,
                "minutes": 0,
                "occurrences": 0,
                **({"line": row.get("line", "")} if include_line else {}),
            },
        )
        item["minutes"] += number(row.get("minutes"))
        item["occurrences"] += number(row.get("occurrences"), 1)
    return sorted(grouped.values(), key=lambda item: item["minutes"], reverse=True)


def grouped_quality(rows, key):
    grouped = {}
    for row in rows:
        name = str(row.get(key) or "Unclassified")
        item = grouped.setdefault(name, {"reason": name, "rejected": 0, "reworked": 0})
        item["rejected"] += number(row.get("rejected_quantity"))
        item["reworked"] += number(row.get("reworked_quantity"))
    return sorted(grouped.values(), key=lambda item: item["rejected"], reverse=True)


def grouped_sku_quality(rows):
    grouped = {}
    for row in rows:
        sku = str(row.get("sku") or "Unassigned")
        item = grouped.setdefault(sku, {"sku": sku, "inspected": 0, "rejected": 0})
        item["inspected"] += number(row.get("inspected_quantity"))
        item["rejected"] += number(row.get("rejected_quantity"))
    for item in grouped.values():
        item["rejectionRate"] = percent(item["rejected"], item["inspected"])
    return sorted(grouped.values(), key=lambda item: item["rejectionRate"], reverse=True)


def latest_inventory(rows):
    latest = {}
    for row in rows:
        material = str(row.get("material") or "Unassigned")
        if material not in latest or str(latest[material].get("date", "")) < str(
            row.get("date", "")
        ):
            latest[material] = row
    return list(latest.values())


def build_inventory_risks(rows, to_value, targets):
    result = []
    end = parse_date(to_value) or date.today()
    for index, row in enumerate(rows):
        available = number(row.get("available_quantity"))
        consumption = number(row.get("daily_consumption"))
        stock_days = available / consumption if consumption else 999
        status = str(row.get("receipt_status", "unknown")).lower()
        if stock_days < max(targets["stockCoverDays"] * 2, 7) or status == "delayed":
            result.append(
                {
                    "id": f"inventory-{index}-{row.get('material', '')}",
                    "material": row.get("material", "Unassigned"),
                    "supplier": row.get("supplier", "Unknown supplier"),
                    "availableQuantity": available,
                    "unit": str(row.get("unit") or "units"),
                    "dailyConsumption": consumption,
                    "stockDays": stock_days,
                    "projectedStockout": (end + timedelta(days=int(stock_days))).isoformat(),
                    "receiptStatus": status,
                    "expectedReceiptDate": row.get("expected_receipt_date"),
                }
            )
    return sorted(result, key=lambda item: item["stockDays"])


def project_record_key(values):
    return str(values.get("project_number", "") or "").strip().casefold()


def stage_record_key(values):
    return (
        project_record_key(values),
        str(values.get("stage_code", "") or "").strip().casefold(),
    )


def latest_project_values(records, key_builder):
    """Resolve re-uploaded source rows without discarding their lineage."""
    latest = {}
    versions = {}
    for record in records:
        values = dict(record["values"])
        key = key_builder(values)
        valid_key = all(key) if isinstance(key, tuple) else bool(key)
        if not valid_key:
            continue
        uploaded_at = record["upload__created_at"]
        version = (uploaded_at, record["source_row"])
        if key in versions and versions[key] >= version:
            continue
        values["_source_uploaded_at"] = uploaded_at.isoformat()
        values["_source_filename"] = record["upload__original_filename"]
        latest[key] = values
        versions[key] = version
    return latest


def build_projects(project_records, stage_records, selected_end):
    project_values = latest_project_values(project_records, project_record_key)
    stage_values = latest_project_values(stage_records, stage_record_key)
    stages_by_project = defaultdict(list)
    for (project_key, _), values in stage_values.items():
        stages_by_project[project_key].append(values)

    projects = []
    end = parse_date(selected_end) or date.today()
    for project_key, values in project_values.items():
        project_number = str(values.get("project_number") or "Unnumbered project").strip()
        start_date = project_date(
            values.get("start_date") or values.get("po_received_date"), end.isoformat()
        )
        customer_due = project_date(
            values.get("customer_due_date") or values.get("commitment_date"), start_date
        )
        commitment = project_date(values.get("commitment_date"), customer_due)
        source_status = canonical_project_status(values.get("status"))
        source_progress = bounded_percent(
            values.get("progress"), 100 if source_status == "Completed" else 0
        )
        source_stages = sorted(
            stages_by_project.get(project_key, []),
            key=lambda item: (
                number(item.get("sequence"), 999),
                str(item.get("stage_name", "")),
            ),
        )
        stages = (
            [build_project_stage(project_number, item) for item in source_stages]
            if source_stages
            else default_project_stages(
                project_number,
                start_date,
                commitment,
                source_progress,
                source_status,
            )
        )
        if source_stages:
            progress = round(sum(item["progress"] for item in stages) / max(len(stages), 1))
            status = derived_project_status(stages, source_status)
        else:
            progress = round(source_progress)
            status = source_status
        prediction = project_delivery_prediction(stages, commitment, values.get("dispatch_date"))
        updated_at = (
            max(
                [
                    str(values.get("_source_uploaded_at") or ""),
                    *(str(item.get("_source_uploaded_at") or "") for item in source_stages),
                ]
            )
            or f"{start_date}T00:00:00"
        )
        team = project_team(values.get("assigned_team"), stages)
        documents = project_documents(project_number, stages, updated_at)
        activities = project_activities(
            project_number,
            stages,
            values.get("_source_filename"),
            updated_at,
        )
        projects.append(
            {
                "id": stable_project_id("project", project_number),
                "projectNumber": project_number,
                "poNumber": str(values.get("po_number") or "—"),
                "customer": str(values.get("customer") or "Unassigned customer"),
                "name": str(values.get("project_name") or project_number),
                "category": str(values.get("category") or "Manufacturing project"),
                "quantity": number(values.get("quantity")),
                "uom": str(values.get("uom") or "units"),
                "unit": str(values.get("factory_unit") or "Factory"),
                "orderValue": number(values.get("order_value")),
                "poReceivedDate": project_date(values.get("po_received_date"), start_date),
                "startDate": start_date,
                "customerDueDate": customer_due,
                "commitmentDate": commitment,
                "dispatchDate": project_date(values.get("dispatch_date"), None),
                "priority": canonical_project_priority(values.get("priority")),
                "status": status,
                "progress": progress,
                "assignedTeam": team,
                "deliveryPrediction": prediction,
                "stages": stages,
                "documents": documents,
                "activities": activities,
                "updatedAt": updated_at,
                "source": {
                    "filename": str(values.get("_source_filename") or "Imported project source"),
                    "hasStageSheet": bool(source_stages),
                },
            }
        )
    priority_rank = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    return sorted(
        projects,
        key=lambda item: (
            item["status"] == "Completed",
            priority_rank[item["priority"]],
            item["commitmentDate"],
        ),
    )


def build_project_stage(project_number, values):
    stage_code = str(values.get("stage_code") or values.get("stage_name") or "stage")
    status = canonical_stage_status(values.get("stage_status"))
    progress = bounded_percent(values.get("progress"), 100 if status == "Completed" else 0)
    return {
        "id": stable_project_id("stage", project_number, stage_code),
        "code": stage_code,
        "name": str(values.get("stage_name") or stage_code),
        "sequence": int(number(values.get("sequence"), 999)),
        "status": status,
        "progress": round(progress),
        "plannedStart": project_date(values.get("planned_start"), ""),
        "actualStart": project_date(values.get("actual_start"), None),
        "plannedCompletion": project_date(values.get("planned_completion"), ""),
        "actualCompletion": project_date(values.get("actual_completion"), None),
        "assignedTo": str(values.get("assigned_to") or "Unassigned"),
        "delayDays": max(0, round(number(values.get("delay_days")))),
        "notes": str(values.get("notes") or "No source note supplied."),
        "attachments": split_source_list(values.get("attachments")),
        "_source_uploaded_at": str(values.get("_source_uploaded_at") or ""),
    }


def default_project_stages(project_number, start_value, commitment_value, progress, status):
    workflow = DEFAULT_PROJECT_WORKFLOW
    if not workflow:
        return []
    start = parse_date(start_value) or date.today()
    commitment = parse_date(commitment_value) or start
    total_days = max((commitment - start).days + 1, len(workflow))
    stage_position = progress / 100 * len(workflow)
    stages = []
    for index, name in enumerate(workflow):
        stage_start = start + timedelta(
            days=int(total_days * index / len(workflow))
        )
        next_start = start + timedelta(
            days=int(total_days * (index + 1) / len(workflow))
        )
        completed = index < int(stage_position)
        active = index == int(stage_position) and 0 < progress < 100
        stage_status = "Completed" if completed else "In Progress" if active else "Not Started"
        if active and status == "Delayed":
            stage_status = "Delayed"
        stage_progress = 100 if completed else round((stage_position % 1) * 100) if active else 0
        stages.append(
            {
                "id": stable_project_id("stage", project_number, str(index + 1)),
                "code": f"DEFAULT-{index + 1:02d}",
                "name": name,
                "sequence": index + 1,
                "status": stage_status,
                "progress": stage_progress,
                "plannedStart": stage_start.isoformat(),
                "actualStart": None,
                "plannedCompletion": max(stage_start, next_start - timedelta(days=1)).isoformat(),
                "actualCompletion": None,
                "assignedTo": "Unassigned",
                "delayDays": 0,
                "notes": (
                    "Derived from project-master progress. Import a Project stages sheet "
                    "for execution detail."
                ),
                "attachments": [],
                "_source_uploaded_at": "",
            }
        )
    return stages


def derived_project_status(stages, source_status):
    if stages and all(item["status"] == "Completed" for item in stages):
        return "Completed"
    if source_status == "On Hold":
        return "On Hold"
    if any(item["status"] == "Delayed" for item in stages):
        return "Delayed"
    if any(item["status"] == "In Progress" or item["progress"] > 0 for item in stages):
        return "In Progress"
    return "Not Started"


def project_delivery_prediction(stages, commitment_value, dispatch_value):
    commitment = parse_date(commitment_value) or date.today()
    dispatch = parse_date(dispatch_value)
    candidates = []
    delayed = False
    actual_evidence = 0
    for stage in stages:
        actual = parse_date(stage.get("actualCompletion"))
        planned = parse_date(stage.get("plannedCompletion"))
        if actual:
            candidates.append(actual)
            actual_evidence += 1
        elif planned:
            candidates.append(planned + timedelta(days=int(number(stage.get("delayDays")))))
        delayed = delayed or stage.get("status") == "Delayed"
    predicted = dispatch or max(candidates, default=commitment)
    state = "Late" if predicted > commitment else "At risk" if delayed else "On track"
    confidence = min(98, round(55 + 40 * actual_evidence / max(len(stages), 1)))
    if all(str(item.get("code", "")).startswith("DEFAULT-") for item in stages):
        confidence = 35
    return {"date": predicted.isoformat(), "confidence": confidence, "state": state}


def project_team(raw_team, stages):
    entries = split_source_list(raw_team)
    members = []
    seen = set()
    for entry in entries:
        name, separator, role = entry.partition("|")
        clean_name = name.strip()
        if not clean_name or clean_name.casefold() in seen:
            continue
        seen.add(clean_name.casefold())
        members.append(team_member(clean_name, role.strip() if separator else "Project team"))
    for stage in stages:
        owner = str(stage.get("assignedTo") or "").strip()
        if not owner or owner == "Unassigned" or owner.casefold() in seen:
            continue
        seen.add(owner.casefold())
        members.append(team_member(owner, str(stage.get("name") or "Stage owner")))
    return members


def team_member(name, role):
    initials = "".join(part[0] for part in name.split() if part)[:2].upper() or "—"
    return {"name": name, "role": role, "initials": initials}


def project_documents(project_number, stages, fallback_timestamp):
    documents = []
    seen = set()
    for stage in stages:
        for attachment in stage.get("attachments", []):
            key = attachment.casefold()
            if key in seen:
                continue
            seen.add(key)
            lower = attachment.casefold()
            category = (
                "Image"
                if lower.endswith((".png", ".jpg", ".jpeg", ".webp"))
                else "Drawing"
                if lower.endswith((".dwg", ".dxf"))
                else "Other"
            )
            documents.append(
                {
                    "id": stable_project_id("document", project_number, attachment),
                    "name": attachment,
                    "category": category,
                    "size": "Source reference",
                    "uploadedBy": stage.get("assignedTo") or "Source sheet",
                    "uploadedAt": date_timestamp(
                        stage.get("actualCompletion") or stage.get("actualStart"),
                        fallback_timestamp,
                    ),
                }
            )
    return documents


def project_activities(project_number, stages, source_filename, imported_at):
    activities = [
        {
            "id": stable_project_id("activity", project_number, str(source_filename)),
            "type": "status",
            "title": "Project source imported",
            "detail": (
                f"Latest project facts were loaded from {source_filename or 'the approved source'}."
            ),
            "user": "Vulcan ingestion",
            "timestamp": imported_at,
        }
    ]
    for stage in stages:
        if stage["status"] == "Not Started" and not stage.get("actualStart"):
            continue
        timestamp = date_timestamp(
            stage.get("actualCompletion") or stage.get("actualStart"), imported_at
        )
        activities.append(
            {
                "id": stable_project_id("activity", project_number, stage["id"], timestamp),
                "type": "stage",
                "title": f"{stage['name']} · {stage['status']}",
                "detail": stage.get("notes") or f"Source progress is {stage['progress']}%.",
                "user": stage.get("assignedTo") or "Source sheet",
                "timestamp": timestamp,
            }
        )
    return sorted(activities, key=lambda item: item["timestamp"], reverse=True)


def project_alerts(factory, projects, selected_end):
    statuses = factory.configuration.get("alertStatuses", {})
    occurred_at = selected_end or date.today().isoformat()
    result = []
    for project in projects:
        if project["status"] == "Completed" or (
            project["status"] != "Delayed" and project["deliveryPrediction"]["state"] == "On track"
        ):
            continue
        delayed = [stage for stage in project["stages"] if stage["status"] == "Delayed"]
        key = f"project-{project['projectNumber']}"
        item = alert(
            key,
            f"{project['projectNumber']} delivery needs attention",
            f"{project['name']} is {project['progress']}% complete with "
            f"{len(delayed)} delayed stage(s).",
            f"{project['customer']} · Projects",
            "critical"
            if project["priority"] == "Critical" or project["deliveryPrediction"]["state"] == "Late"
            else "high",
            "Review the delayed stage owners and refresh the stage source after the recovery plan.",
            f"Commitment {project['commitmentDate']}",
            f"Predicted {project['deliveryPrediction']['date']}",
            occurred_at,
            [project["projectNumber"], *(stage["name"] for stage in delayed[:3])],
        )
        item["status"] = statuses.get(key, "new")
        if item["status"] != "dismissed":
            result.append(item)
    return result[:5]


def canonical_project_status(value):
    statuses = {
        "not started": "Not Started",
        "in progress": "In Progress",
        "delayed": "Delayed",
        "completed": "Completed",
        "on hold": "On Hold",
    }
    return statuses.get(str(value or "").strip().casefold(), "Not Started")


def canonical_stage_status(value):
    statuses = {
        "not started": "Not Started",
        "in progress": "In Progress",
        "delayed": "Delayed",
        "completed": "Completed",
    }
    return statuses.get(str(value or "").strip().casefold(), "Not Started")


def canonical_project_priority(value):
    priorities = {"critical": "Critical", "high": "High", "medium": "Medium", "low": "Low"}
    return priorities.get(str(value or "").strip().casefold(), "Medium")


def bounded_percent(value, fallback=0):
    return min(100, max(0, number(value, fallback)))


def split_source_list(value):
    raw = str(value or "").replace("\n", ";")
    separator = ";" if ";" in raw else ","
    return [item.strip() for item in raw.split(separator) if item.strip()]


def stable_project_id(prefix, *parts):
    digest = hashlib.sha1("|".join(parts).casefold().encode(), usedforsecurity=False).hexdigest()[
        :16
    ]
    return f"{prefix}-{digest}"


def project_date(value, fallback):
    parsed = parse_date(value)
    return parsed.isoformat() if parsed else fallback


def date_timestamp(value, fallback):
    parsed = parse_date(value)
    return f"{parsed.isoformat()}T00:00:00" if parsed else fallback


def build_data_health(latest_dates, uploaded_types, selected_end):
    end = selected_end or date.today()
    stale_after_days = {
        "process": 2,
        "production": 2,
        "downtime": 7,
        "quality": 7,
        "inventory": 3,
        "supplier": 14,
        "utilities": 2,
    }
    result = {}
    for dataset_type, threshold in stale_after_days.items():
        latest = latest_dates.get(dataset_type)
        if dataset_type not in uploaded_types:
            result[dataset_type] = {
                "status": "absent",
                "latestDate": None,
                "ageDays": None,
                "staleAfterDays": threshold,
            }
            continue
        age = max((end - latest).days, 0) if latest else None
        result[dataset_type] = {
            "status": "stale" if age is None or age > threshold else "current",
            "latestDate": latest.isoformat() if latest else None,
            "ageDays": age,
            "staleAfterDays": threshold,
        }
    return result


def build_order_risks(rows, to_value, average_daily_good, machine_loss):
    end = parse_date(to_value) or date.today()
    result = []
    for row in rows:
        if str(row.get("status", "open")).lower() == "completed":
            continue
        required = number(row.get("required_quantity"))
        produced = number(row.get("produced_quantity"))
        remaining = max(required - produced, 0)
        due = parse_date(row.get("due_date")) or end
        days_left = max((due - end).days, 0.25)
        risk_score = (remaining / days_left) / max(average_daily_good, 1)
        risk = (
            "critical" if days_left <= 1 and remaining else "high" if risk_score > 0.5 else "watch"
        )
        reason = (
            f"{machine_loss[0]['machine']} lost {duration_label(machine_loss[0]['minutes'])}"
            if machine_loss
            else "Required run rate is above the recent average"
        )
        result.append(
            {
                "orderId": row.get("order_id", "Unassigned"),
                "sku": row.get("sku", "Unassigned"),
                "dueDate": due.isoformat(),
                "completion": percent(produced, required),
                "remaining": remaining,
                "risk": risk,
                "reason": reason,
            }
        )
    weights = {"critical": 0, "high": 1, "watch": 2}
    return sorted(result, key=lambda item: weights[item["risk"]])


def build_supplier_scores(rows):
    """Score suppliers using only agreed, auditable delivery facts."""
    grouped = defaultdict(list)
    for row in rows:
        grouped[str(row.get("supplier") or "Unassigned supplier")].append(row)

    scores = []
    for supplier, deliveries in grouped.items():
        on_time_points = []
        quantity_rates = []
        acceptance_rates = []
        terms_results = []
        delay_days = []
        materials = set()
        for delivery in deliveries:
            promised = parse_date(delivery.get("promised_date"))
            actual = parse_date(delivery.get("actual_delivery_date"))
            delay = max((actual - promised).days, 0) if promised and actual else 30
            ordered = number(delivery.get("ordered_quantity"))
            received = number(delivery.get("received_quantity"))
            accepted = number(delivery.get("accepted_quantity"))
            terms_met = truthy(delivery.get("terms_met"))
            on_time_points.append(max(0, 60 - delay * 10))
            quantity_rates.append(min(received / ordered, 1) if ordered else 0)
            acceptance_rates.append(min(accepted / received, 1) if received else 0)
            terms_results.append(1 if terms_met else 0)
            delay_days.append(delay)
            if delivery.get("material"):
                materials.add(str(delivery["material"]))

        count = len(deliveries)
        on_time_score = sum(on_time_points) / count
        quantity_rate = sum(quantity_rates) / count
        acceptance_rate = sum(acceptance_rates) / count
        terms_rate = sum(terms_results) / count
        score = on_time_score + quantity_rate * 25 + acceptance_rate * 10 + terms_rate * 5
        scores.append(
            {
                "supplier": supplier,
                "score": round(score, 1),
                "status": supplier_status(score),
                "deliveries": count,
                "onTimeRate": percent(sum(delay == 0 for delay in delay_days), count),
                "quantityFulfillment": quantity_rate * 100,
                "acceptanceRate": acceptance_rate * 100,
                "termsFulfillment": terms_rate * 100,
                "lateDeliveries": sum(delay > 0 for delay in delay_days),
                "averageDelayDays": sum(delay_days) / count,
                "materials": sorted(materials),
            }
        )
    return sorted(scores, key=lambda item: item["score"])


def truthy(value):
    return str(value or "").strip().casefold() in {"1", "true", "yes", "y", "met", "fulfilled"}


def supplier_status(score):
    if score >= 90:
        return "preferred"
    if score >= 75:
        return "stable"
    if score >= 60:
        return "watch"
    return "critical"


def generated_alerts(
    factory,
    filters,
    targets,
    oee,
    planned,
    actual,
    machine_loss,
    defect_loss,
    inventory_risks,
    order_risks,
    supplier_scores,
    rejection_rate,
):
    alerts = []
    end = filters.get("to") or date.today().isoformat()
    rejection_limit = targets["rejectionRate"]
    if order_risks:
        order = order_risks[0]
        alerts.append(
            alert(
                f"order-{order['orderId']}",
                f"{order['orderId']} is at risk",
                f"{order['remaining']:g} units remain before {order['dueDate']}.",
                f"{order['sku']} · Orders",
                "critical" if order["risk"] == "critical" else "high",
                "Re-sequence the constrained line and secure material before "
                "committing the next shift.",
                "Projected completion > due date",
                f"{order['completion']:.1f}% complete",
                end,
                [order["orderId"], order["reason"]],
            )
        )
    if machine_loss and machine_loss[0]["minutes"] > targets["downtimeMinutes"]:
        loss = machine_loss[0]
        alerts.append(
            alert(
                f"downtime-{loss['machine']}",
                f"{loss['machine']} is the largest bottleneck",
                f"{duration_label(loss['minutes'])} lost across {loss['occurrences']:g} stops.",
                f"{loss['machine']} · {loss['line']}",
                "critical" if loss["minutes"] > 120 else "high",
                "Inspect the recurring failure mode before the next planned changeover "
                "and assign maintenance ownership.",
                f"> {duration_label(targets['downtimeMinutes'])} lost",
                duration_label(loss["minutes"]),
                end,
                [f"{loss['occurrences']:g} stop records", duration_label(loss["minutes"])],
            )
        )
    if inventory_risks:
        item = inventory_risks[0]
        alerts.append(
            alert(
                f"inventory-{item['material']}",
                f"{item['material']} stock-out projected",
                f"Current stock covers {item['stockDays']:.1f} production days.",
                f"{item['supplier']} · Inventory",
                "critical" if item["stockDays"] < 2 else "high",
                "Expedite the receipt or re-sequence orders that consume this material.",
                f"< {targets['stockCoverDays']} days cover",
                f"{item['stockDays']:.1f} days",
                end,
                [
                    f"{item['availableQuantity']:g} available",
                    f"{item['dailyConsumption']:g}/day consumption",
                ],
            )
        )
    if planned and oee < targets["oee"]:
        alerts.append(
            alert(
                "oee-below-target",
                "Factory OEE is below target",
                f"OEE is {oee:.1f}%, driven by the current availability and loss profile.",
                "Factory performance",
                "high" if oee < 65 else "medium",
                "Prioritise the top bottleneck before pursuing speed improvements.",
                f"< {targets['oee']}%",
                f"{oee:.1f}%",
                end,
                [f"Plan {planned:g}", f"Actual {actual:g}", f"OEE {oee:.1f}%"],
            )
        )
    if planned and percent(actual, planned) < targets["planAttainment"]:
        alerts.append(
            alert(
                "production-below-plan",
                "Production is below plan",
                f"Output reached {percent(actual, planned):.1f}% of the selected-period plan.",
                "Factory production",
                "high" if percent(actual, planned) < 75 else "medium",
                "Review the largest downtime and speed losses before changing the plan.",
                f"< {targets['planAttainment']}% attainment",
                f"{percent(actual, planned):.1f}%",
                end,
                [f"Plan {planned:g}", f"Actual {actual:g}"],
            )
        )
    if rejection_rate > rejection_limit:
        alerts.append(
            alert(
                "rejection-above-target",
                "Rejection is above target",
                f"Rejected output is {rejection_rate:.1f}% for the selected period.",
                "Factory quality",
                "high" if rejection_rate > rejection_limit * 1.5 else "medium",
                "Review the leading defect reason and affected SKU before the next run.",
                f"> {rejection_limit}% rejection",
                f"{rejection_rate:.1f}%",
                end,
                [f"Rejection rate {rejection_rate:.1f}%"],
            )
        )
    if supplier_scores and supplier_scores[0]["score"] < targets["supplierScore"]:
        supplier = supplier_scores[0]
        alerts.append(
            alert(
                f"supplier-{supplier['supplier']}",
                f"{supplier['supplier']} delivery performance needs review",
                f"The supplier scored {supplier['score']:.1f}/100 across "
                f"{supplier['deliveries']} deliveries.",
                f"{supplier['supplier']} · Supply",
                "high" if supplier["score"] < 60 else "medium",
                "Review late deliveries, quantity shortfalls and unfulfilled terms "
                "before placing the next order.",
                f"< {targets['supplierScore']} supplier score",
                f"{supplier['score']:.1f}/100",
                end,
                [
                    f"{supplier['onTimeRate']:.1f}% on time",
                    f"{supplier['quantityFulfillment']:.1f}% quantity fulfilled",
                ],
            )
        )
    if defect_loss:
        defect = defect_loss[0]
        alerts.append(
            alert(
                f"quality-{defect['reason']}",
                f"{defect['reason']} leads quality loss",
                f"{defect['rejected']:g} rejected units share this defect reason.",
                "Quality · Rejections",
                "medium",
                "Verify the process parameter at first-piece approval and "
                "sample the next three batches.",
                "Top defect reason",
                f"{defect['rejected']:g} rejected",
                end,
                [f"{defect['rejected']:g} rejected records"],
            )
        )
    statuses = factory.configuration.get("alertStatuses", {})
    return [
        {**item, "status": statuses.get(item["id"], "new")}
        for item in alerts
        if statuses.get(item["id"]) != "dismissed"
    ]


def alert(
    key,
    title,
    description,
    asset,
    severity,
    recommendation,
    threshold,
    observed,
    occurred_at,
    evidence,
):
    return {
        "id": key,
        "title": title,
        "description": description,
        "asset": asset,
        "severity": severity,
        "occurredAt": occurred_at,
        "relativeTime": "Selected period",
        "recommendation": recommendation,
        "threshold": threshold,
        "observed": observed,
        "ruleVersion": "factory-rules-v1",
        "evidence": evidence,
    }


def answer_question(intelligence, question):
    normalized = question.casefold()
    if any(word in normalized for word in ["supplier", "delivery", "vendor"]):
        items = intelligence["supplierScores"]
        if items:
            item = items[0]
            return response(
                f"{item['supplier']} has the lowest supplier score at {item['score']:.1f}/100.",
                f"It delivered {item['onTimeRate']:.1f}% on time and fulfilled "
                f"{item['quantityFulfillment']:.1f}% of ordered quantity.",
                [
                    f"{item['deliveries']} deliveries",
                    f"{item['lateDeliveries']} late",
                ],
            )
    if "order" in normalized and intelligence["orderRisks"]:
        item = intelligence["orderRisks"][0]
        return response(
            f"{item['orderId']} ({item['sku']}) needs attention first: "
            f"{item['remaining']:g} units remain.",
            item["reason"],
            [item["orderId"], f"Due {item['dueDate']}"],
        )
    if any(word in normalized for word in ["machine", "bottleneck", "loss"]):
        items = intelligence["machineLoss"]
        if items:
            item = items[0]
            return response(
                f"{item['machine']} is creating the largest bottleneck.",
                f"It lost {duration_label(item['minutes'])} across {item['occurrences']:g} stops.",
                [item["machine"], item["line"]],
            )
    if any(word in normalized for word in ["material", "stock"]):
        items = intelligence["inventoryRisks"]
        if items:
            item = items[0]
            return response(
                f"{item['material']} may run out first, with "
                f"{item['stockDays']:.1f} days of cover.",
                f"The current receipt status is {item['receiptStatus']}.",
                [item["material"]],
            )
    totals = intelligence["totals"]
    return response(
        f"Production is {totals['actual']:g} units against a plan of "
        f"{totals['planned']:g} units.",
        "This answer uses only validated records in the selected factory and date range.",
        [f"Plan {totals['planned']:g}", f"Actual {totals['actual']:g}"],
    )


def response(answer, reasoning, evidence):
    return {"answer": answer, "reasoning": reasoning, "evidence": evidence}


def number(value, fallback=0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def optional_number(value):
    if value in {None, ""}:
        return None
    return number(value)


def total(rows, key):
    return sum(number(row.get(key)) for row in rows)


def unique_sum_and_count(rows, value_key, group_key):
    grouped = {}
    for index, row in enumerate(rows):
        value = row.get(value_key)
        if value in {None, ""}:
            continue
        key = str(row.get(group_key, "")).strip() or f"row-{index}"
        grouped[key] = max(grouped.get(key, 0), number(value))
    return sum(grouped.values()), len(grouped)


def unique_total(rows, value_key, group_key):
    value, _ = unique_sum_and_count(rows, value_key, group_key)
    return value


def optional_total(rows, key):
    values = [number(row.get(key)) for row in rows if row.get(key) not in {None, ""}]
    return sum(values) if values else None


def percent(numerator, denominator):
    return numerator / denominator * 100 if denominator else 0


def parse_date(value):
    try:
        return date.fromisoformat(str(value)) if value else None
    except ValueError:
        return None
