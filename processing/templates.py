from processing.mapping import TemplateField
from processing.validation import FieldRule


def field(key, label, data_type="string", required=False, aliases=()):
    return TemplateField(key, label, data_type, required, tuple(aliases))


TEMPLATES = {
    "projects": [
        field(
            "project_number",
            "Crop batch number",
            required=True,
            aliases=["project no", "project no.", "project id", "order id"],
        ),
        field(
            "customer",
            "Customer / crop programme",
            required=True,
            aliases=["customer name", "client", "customer name."],
        ),
        field(
            "project_name",
            "Crop cycle name",
            required=True,
            aliases=["project name.", "project description", "description"],
        ),
        field("po_number", "Sales / programme reference", aliases=["po no", "po no.", "po number"]),
        field("category", "Mushroom variety", aliases=["project category", "variety"]),
        field("quantity", "Planned harvest quantity", "decimal", aliases=["qty", "order quantity"]),
        field("uom", "Unit of measure", aliases=["unit of measure", "unit"]),
        field(
            "factory_unit",
            "Growing wing",
            aliases=["unit-i / unit-ii", "unit i / unit ii", "plant", "factory"],
        ),
        field(
            "order_value", "Expected crop value", "decimal", aliases=["po value", "project value"]
        ),
        field(
            "po_received_date",
            "Programme received date",
            "date",
            aliases=["po received date.", "purchase order date"],
        ),
        field(
            "start_date",
            "Spawn / crop start date",
            "date",
            aliases=["date", "project date", "spawn date"],
        ),
        field(
            "customer_due_date",
            "Expected first dispatch date",
            "date",
            aliases=[
                "cust. expet delivery date.",
                "customer expected delivery date",
                "delivery date",
                "due date",
            ],
        ),
        field(
            "commitment_date",
            "Expected final harvest date",
            "date",
            aliases=["ig commitment date", "committed date"],
        ),
        field(
            "dispatch_date",
            "Actual final harvest date",
            "date",
            aliases=["ig dispatch date.", "actual dispatch date"],
        ),
        field("priority", "Crop priority", aliases=["project priority"]),
        field("status", "Crop cycle status", aliases=["current status"]),
        field(
            "progress",
            "Crop cycle completion percent",
            "decimal",
            aliases=["overall progress", "completion %", "project progress"],
        ),
        field(
            "assigned_team",
            "Assigned crop team",
            aliases=["project team", "team", "assigned people"],
        ),
    ],
    "project_stages": [
        field(
            "project_number",
            "Crop batch number",
            required=True,
            aliases=["project no", "project no.", "project id", "order id"],
        ),
        field("stage_code", "Crop stage code", required=True, aliases=["operation code"]),
        field(
            "stage_name",
            "Crop stage name",
            required=True,
            aliases=["stage", "operation", "process", "manufacturing stage"],
        ),
        field("sequence", "Sequence", "decimal", True, ["stage sequence", "order"]),
        field(
            "stage_status",
            "Crop stage status",
            required=True,
            aliases=["status", "current status"],
        ),
        field(
            "progress", "Stage completion percent", "decimal", True, ["progress", "completion %"]
        ),
        field("planned_start", "Planned start date", "date", True, ["planned start"]),
        field("actual_start", "Actual start date", "date", aliases=["actual start"]),
        field(
            "planned_completion",
            "Planned completion date",
            "date",
            True,
            ["planned completion", "planned finish"],
        ),
        field(
            "actual_completion",
            "Actual completion date",
            "date",
            aliases=["actual completion", "actual finish"],
        ),
        field(
            "assigned_to",
            "Crop owner",
            aliases=["owner", "responsible person", "assigned person"],
        ),
        field("delay_days", "Delay days", "decimal", aliases=["delay", "days delayed"]),
        field("notes", "Notes", aliases=["remarks", "stage notes"]),
        field(
            "attachments",
            "Attachment names or links",
            aliases=["attachment", "documents", "document links"],
        ),
    ],
    "process": [
        field("date", "Observation date", "date", True, ["date", "operational date"]),
        field(
            "line",
            "Growing wing / compost line",
            required=True,
            aliases=["line", "line name", "wing"],
        ),
        field(
            "process",
            "Cultivation stage",
            required=True,
            aliases=["stage", "operation", "crop stage"],
        ),
        field(
            "machine",
            "Growing room / process asset",
            required=True,
            aliases=["equipment", "asset", "room"],
        ),
        field("shift", "Observation round", required=True, aliases=["shift name", "round"]),
        field(
            "status",
            "Room / stage state",
            required=True,
            aliases=["state", "machine status", "room status"],
        ),
        field(
            "input_quantity", "Material or crop input", "decimal", True, ["input", "feed quantity"]
        ),
        field("output_quantity", "Stage output", "decimal", True, ["output", "produced"]),
        field(
            "rejected_quantity",
            "Contaminated / discarded quantity",
            "decimal",
            aliases=["rejects", "scrap"],
        ),
        field("run_minutes", "Active minutes", "decimal", aliases=["operating minutes", "runtime"]),
        field(
            "cycle_time_minutes",
            "Stage cycle time",
            "decimal",
            aliases=["cycle time", "minutes per cycle"],
        ),
        field("temperature_c", "Temperature", "decimal", aliases=["temperature", "temp c"]),
        field(
            "humidity_pct", "Relative humidity", "decimal", aliases=["humidity", "rh", "rh percent"]
        ),
        field("co2_ppm", "Carbon dioxide", "decimal", aliases=["co2", "carbon dioxide", "co2 ppm"]),
        field(
            "substrate_moisture_pct",
            "Substrate moisture",
            "decimal",
            aliases=["substrate moisture", "compost moisture", "moisture percent"],
        ),
        field(
            "water_litres",
            "Water applied",
            "decimal",
            aliases=["water", "water litres", "irrigation"],
        ),
        field("treatment", "Treatment / chemical", aliases=["medicine", "chemical", "spray"]),
        field(
            "treatment_quantity",
            "Treatment quantity",
            "decimal",
            aliases=["dose", "chemical quantity"],
        ),
        field(
            "temperature_min_c",
            "Temperature target minimum",
            "decimal",
            aliases=["minimum temperature"],
        ),
        field(
            "temperature_max_c",
            "Temperature target maximum",
            "decimal",
            aliases=["maximum temperature"],
        ),
        field(
            "humidity_min_pct", "Humidity target minimum", "decimal", aliases=["minimum humidity"]
        ),
        field(
            "humidity_max_pct", "Humidity target maximum", "decimal", aliases=["maximum humidity"]
        ),
        field("co2_max_ppm", "CO2 target maximum", "decimal", aliases=["maximum co2"]),
        field("pressure_bar", "Pressure", "decimal", aliases=["pressure"]),
        field("energy_kwh", "Energy consumed", "decimal", aliases=["energy", "power consumption"]),
        field("downtime_minutes", "Downtime", "decimal", aliases=["downtime", "stop minutes"]),
        field("operator", "Grower / operator", aliases=["operator name", "grower"]),
        field("batch_id", "Crop batch ID", aliases=["batch", "lot", "crop batch"]),
    ],
    "production": [
        field("date", "Harvest date", "date", True, ["date", "operational date"]),
        field("line", "Growing wing", required=True, aliases=["line", "line name", "wing"]),
        field("machine", "Growing room", required=True, aliases=["machine", "equipment", "room"]),
        field(
            "sku",
            "Mushroom variety / grade",
            required=True,
            aliases=["sku", "product", "item code", "variety"],
        ),
        field("shift", "Harvest shift", required=True, aliases=["shift", "shift name"]),
        field("order_id", "Customer / harvest order ID", aliases=["order", "production order"]),
        field("planned_quantity", "Planned harvest kg", "decimal", True, ["plan", "target output"]),
        field(
            "actual_quantity",
            "Total harvested kg",
            "decimal",
            True,
            ["actual output", "output", "harvest kg"],
        ),
        field(
            "good_quantity",
            "Saleable Grade A kg",
            "decimal",
            True,
            ["accepted qty", "good output", "saleable kg"],
        ),
        field(
            "rejected_quantity",
            "Discarded / contaminated kg",
            "decimal",
            aliases=["reject qty", "scrap", "contaminated kg"],
        ),
        field(
            "reworked_quantity",
            "Downgraded Grade B kg",
            "decimal",
            aliases=["rework", "grade b kg"],
        ),
        field("batch_id", "Crop batch ID", aliases=["batch", "lot", "crop batch"]),
        field("flush_number", "Flush number", "decimal", aliases=["flush", "harvest flush"]),
        field(
            "substrate_dry_kg",
            "Dry substrate input kg",
            "decimal",
            aliases=["dry substrate", "dry compost kg"],
        ),
        field("growing_area_m2", "Growing area", "decimal", aliases=["area", "growing area m2"]),
        field("water_litres", "Water applied", "decimal", aliases=["water", "water litres"]),
        field(
            "crop_age_days", "Crop age", "decimal", aliases=["days from spawning", "crop age days"]
        ),
        field("planned_minutes", "Planned minutes", "decimal", aliases=["planned time"]),
        field(
            "downtime_minutes", "Downtime minutes", "decimal", aliases=["downtime", "stop minutes"]
        ),
        field(
            "ideal_cycle_minutes",
            "Ideal cycle minutes",
            "decimal",
            aliases=["ideal cycle", "cycle time"],
        ),
    ],
    "downtime": [
        field("date", "Date", "date", True, ["downtime date"]),
        field("line", "Growing wing", required=True, aliases=["line", "wing"]),
        field("machine", "Room / climate asset", required=True, aliases=["equipment", "room"]),
        field("shift", "Observation round", required=True),
        field(
            "reason",
            "Room / equipment downtime reason",
            required=True,
            aliases=["reason", "reason code"],
        ),
        field("minutes", "Minutes lost", "decimal", True, ["duration", "downtime minutes"]),
        field("occurrences", "Occurrences", "decimal", aliases=["count", "stops"]),
    ],
    "quality": [
        field("date", "Inspection / harvest date", "date", True, ["quality date"]),
        field("line", "Growing wing", required=True),
        field("machine", "Growing room"),
        field(
            "sku", "Mushroom variety / grade", required=True, aliases=["product", "item", "variety"]
        ),
        field("shift", "Harvest shift", required=True),
        field(
            "inspected_quantity",
            "Inspected harvest kg",
            "decimal",
            True,
            ["inspected", "total inspected"],
        ),
        field(
            "rejected_quantity",
            "Discarded / contaminated kg",
            "decimal",
            True,
            ["rejected", "reject qty", "scrap"],
        ),
        field(
            "reworked_quantity", "Downgraded Grade B kg", "decimal", aliases=["rework", "reworked"]
        ),
        field(
            "defect_reason",
            "Crop quality / contamination reason",
            required=True,
            aliases=["defect", "rejection reason", "contamination reason"],
        ),
    ],
    "inventory": [
        field("date", "Snapshot date", "date", True, ["date"]),
        field("material", "Material", required=True, aliases=["material name", "item"]),
        field("supplier", "Supplier", aliases=["vendor"]),
        field("unit", "Unit of measure", aliases=["uom", "stock unit"]),
        field(
            "available_quantity",
            "Available quantity",
            "decimal",
            True,
            ["stock", "available", "on hand"],
        ),
        field(
            "daily_consumption",
            "Daily consumption",
            "decimal",
            True,
            ["daily usage", "consumption"],
        ),
        field("safety_stock", "Safety stock", "decimal", aliases=["minimum stock"]),
        field(
            "expected_receipt_date",
            "Expected receipt date",
            "date",
            aliases=["expected delivery", "receipt date", "eta"],
        ),
        field("required_date", "Required date", "date", aliases=["need by"]),
        field("receipt_status", "Receipt status", aliases=["delivery status"]),
    ],
    "supplier": [
        field("supplier", "Supplier", required=True, aliases=["supplier name", "vendor"]),
        field("material", "Material", required=True, aliases=["material code", "item"]),
        field(
            "purchase_order",
            "Purchase order",
            required=True,
            aliases=["po", "po number", "order number"],
        ),
        field("order_date", "Order date", "date", True, ["po date"]),
        field(
            "promised_date",
            "Promised delivery date",
            "date",
            True,
            ["agreed date", "committed date", "due date"],
        ),
        field(
            "actual_delivery_date",
            "Actual delivery date",
            "date",
            True,
            ["receipt date", "delivered date", "grn date"],
        ),
        field(
            "ordered_quantity",
            "Ordered quantity",
            "decimal",
            True,
            ["po quantity", "order qty"],
        ),
        field(
            "received_quantity",
            "Received quantity",
            "decimal",
            True,
            ["delivered quantity", "receipt qty"],
        ),
        field(
            "accepted_quantity",
            "Accepted quantity",
            "decimal",
            True,
            ["quality accepted", "accepted qty"],
        ),
        field(
            "terms_met",
            "Delivery terms fulfilled",
            required=True,
            aliases=["terms fulfilled", "terms met", "compliance"],
        ),
    ],
    "orders": [
        field("order_id", "Order ID", required=True, aliases=["order", "production order"]),
        field("sku", "Product / SKU", required=True, aliases=["product", "item"]),
        field("line", "Production line", required=True),
        field(
            "required_quantity",
            "Required quantity",
            "decimal",
            True,
            ["required qty", "order qty", "quantity"],
        ),
        field(
            "produced_quantity",
            "Produced quantity",
            "decimal",
            True,
            ["produced qty", "completed qty", "actual"],
        ),
        field("due_date", "Due date", "date", True, ["due", "delivery date"]),
        field("priority", "Priority"),
        field("status", "Status", aliases=["order status"]),
    ],
    "utilities": [
        field("date", "Boiler log date", "date", True, ["date", "log date"]),
        field("shift", "Shift", required=True, aliases=["shift name"]),
        field("boiler", "Boiler", required=True, aliases=["boiler name", "asset"]),
        field(
            "feedwater_kg", "Feedwater supplied", "decimal", True,
            ["feed water kg", "feedwater flow kg", "boiler feedwater kg"],
        ),
        field(
            "feedwater_inlet_temperature_c", "Feedwater inlet temperature", "decimal", True,
            ["inlet temp c", "makeup water temp", "feedwater inlet temp"],
        ),
        field(
            "feedwater_tank_temperature_c", "Feedwater tank temperature", "decimal", True,
            ["tank temp c", "bft temperature", "feedwater tank temp"],
        ),
        field(
            "steam_generated_kg", "Steam generated", "decimal", True,
            ["steam kg", "steam usage", "steam output"],
        ),
        field(
            "recovered_condensate_kg", "Recovered condensate", "decimal", True,
            ["condensate return kg", "condensate recovered"],
        ),
        field(
            "flash_steam_recovered_kg", "Flash steam recovered", "decimal", True,
            ["flash steam kg", "recovered flash steam"],
        ),
        field(
            "briquette_used_kg", "Briquettes used", "decimal", True,
            ["briquette kg", "biomass fuel kg", "fuel used kg"],
        ),
        field(
            "briquette_gcv_kcal_per_kg", "Briquette GCV", "decimal", True,
            ["gcv", "fuel gcv kcal kg", "calorific value"],
        ),
        field(
            "boiler_efficiency_percent", "Boiler efficiency", "decimal", True,
            ["boiler efficiency pct", "efficiency percent"],
        ),
    ],
}

# Automotive and mushroom cells share the same normalized analytical schema.
# The deployment variant changes the human contract presented during mapping;
# source keys remain stable so the processing and audit layers stay common.
AUTOMOTIVE_LABELS = {
    "projects": {
        "project_number": "Project number",
        "customer": "Customer",
        "project_name": "Project name",
        "po_number": "Purchase order number",
        "category": "Category",
        "quantity": "Quantity",
        "factory_unit": "Factory unit",
        "order_value": "Order value",
        "po_received_date": "PO received date",
        "start_date": "Project start date",
        "customer_due_date": "Customer expected delivery date",
        "commitment_date": "Factory commitment date",
        "dispatch_date": "Dispatch date",
        "priority": "Priority",
        "status": "Project status",
        "progress": "Overall completion percent",
        "assigned_team": "Assigned team",
    },
    "project_stages": {
        "project_number": "Project number",
        "stage_code": "Stage code",
        "stage_name": "Stage name",
        "stage_status": "Stage status",
        "progress": "Completion percent",
        "assigned_to": "Assigned person",
    },
    "process": {
        "date": "Process date",
        "line": "Production line",
        "process": "Manufacturing process",
        "machine": "Machine",
        "shift": "Shift",
        "status": "Process state",
        "input_quantity": "Input quantity",
        "output_quantity": "Output quantity",
        "rejected_quantity": "Rejected quantity",
        "run_minutes": "Run minutes",
        "cycle_time_minutes": "Cycle time",
        "operator": "Operator",
        "batch_id": "Batch ID",
    },
    "production": {
        "date": "Production date",
        "line": "Production line",
        "machine": "Machine",
        "sku": "Product / SKU",
        "shift": "Shift",
        "order_id": "Order ID",
        "planned_quantity": "Planned quantity",
        "actual_quantity": "Actual quantity",
        "good_quantity": "Good quantity",
        "rejected_quantity": "Rejected quantity",
        "reworked_quantity": "Reworked quantity",
        "batch_id": "Batch ID",
    },
    "downtime": {
        "line": "Production line",
        "machine": "Machine",
        "shift": "Shift",
        "reason": "Downtime reason",
    },
    "quality": {
        "date": "Date",
        "line": "Production line",
        "machine": "Machine",
        "sku": "Product / SKU",
        "shift": "Shift",
        "inspected_quantity": "Inspected quantity",
        "rejected_quantity": "Rejected quantity",
        "reworked_quantity": "Reworked quantity",
        "defect_reason": "Defect reason",
    },
}

AUTOMOTIVE_EXCLUDED_FIELDS = {
    "process": {
        "humidity_pct",
        "co2_ppm",
        "substrate_moisture_pct",
        "water_litres",
        "treatment",
        "treatment_quantity",
        "humidity_min_pct",
        "humidity_max_pct",
        "co2_max_ppm",
    },
    "production": {
        "flush_number",
        "substrate_dry_kg",
        "growing_area_m2",
        "water_litres",
        "crop_age_days",
    },
}

MUSHROOM_ALIAS_TERMS = (
    "contamination",
    "crop",
    "compost",
    "cultivation",
    "farm",
    "flush",
    "grower",
    "growing",
    "harvest",
    "humidity",
    "irrigation",
    "mushroom",
    "room",
    "spawn",
    "substrate",
)


def templates_for_variant(variant="mushroom"):
    if variant == "mushroom":
        return TEMPLATES
    if variant != "automotive":
        raise ValueError(f"Unsupported processing variant: {variant!r}.")
    return {
        dataset_type: [
            TemplateField(
                item.key,
                AUTOMOTIVE_LABELS.get(dataset_type, {}).get(item.key, item.display_name),
                item.data_type,
                item.required,
                tuple(
                    alias
                    for alias in item.aliases
                    if not any(term in alias.casefold() for term in MUSHROOM_ALIAS_TERMS)
                ),
            )
            for item in fields
            if item.key not in AUTOMOTIVE_EXCLUDED_FIELDS.get(dataset_type, set())
        ]
        for dataset_type, fields in TEMPLATES.items()
    }


def field_rules(dataset_type, variant="mushroom"):
    return [
        FieldRule(
            item.key, item.required, item.data_type, 0 if item.data_type == "decimal" else None
        )
        for item in templates_for_variant(variant)[dataset_type]
    ]


def serialize_fields(dataset_type, variant="mushroom"):
    return [
        {
            "key": item.key,
            "label": item.display_name,
            "type": "number" if item.data_type == "decimal" else item.data_type,
            "required": item.required,
            "aliases": list(item.aliases),
        }
        for item in templates_for_variant(variant)[dataset_type]
    ]
