"""
Dataset field templates for the Tamaso platform.

Operating template branch: MFG.DA.AUTO.ALL (Automotive Manufacturing)

Platform Core contains the structural framework: TemplateField, field helpers,
and the TEMPLATES dictionary with dataset type keys. This file is populated with
automotive manufacturing-specific field definitions, labels, and aliases.
"""

from processing.mapping import TemplateField
from processing.validation import FieldRule


def field(key, label, data_type="string", required=False, aliases=()):
    """Create a TemplateField with sensible defaults."""
    return TemplateField(key, label, data_type, required, tuple(aliases))


# ---------------------------------------------------------------------------
# Dataset templates — MFG.DA.AUTO.ALL (Automotive Manufacturing)
#
# Each field includes aliases representing common alternate column headers
# encountered in CSV imports from automotive manufacturing environments.
# ---------------------------------------------------------------------------

TEMPLATES: dict[str, list[TemplateField]] = {
    # -------------------------------------------------------------------
    # PROCESS — manufacturing process parameters and output
    # -------------------------------------------------------------------
    "process": [
        field("date", "Process date", data_type="date", required=True, aliases=(
            "production date", "process date", "run date",
        )),
        field("line", "Production line", required=True, aliases=(
            "production line", "line id", "manufacturing line", "cell",
        )),
        field("process", "Manufacturing process", required=True, aliases=(
            "process name", "operation", "process type", "mfg process",
        )),
        field("machine", "Machine", required=True, aliases=(
            "machine id", "equipment", "machine name", "asset",
        )),
        field("shift", "Shift", required=True, aliases=(
            "work shift", "shift id", "shift name",
        )),
        field("status", "Process state", required=True, aliases=(
            "state", "process status", "run status",
        )),
        field("input_quantity", "Input quantity", data_type="decimal", required=True, aliases=(
            "input qty", "feed qty", "material in", "input",
        )),
        field("output_quantity", "Output quantity", data_type="decimal", required=True, aliases=(
            "output qty", "produced qty", "output", "parts out",
        )),
        field("rejected_quantity", "Rejected quantity", data_type="decimal", aliases=(
            "reject qty", "rejects", "scrap qty", "rejected",
        )),
        field("run_minutes", "Run minutes", data_type="decimal", aliases=(
            "run time", "runtime", "operating minutes", "run duration",
        )),
        field("cycle_time_minutes", "Cycle time", data_type="decimal", aliases=(
            "cycle time", "takt", "cycle minutes", "ct",
        )),
        field("temperature_c", "Temperature", data_type="decimal", aliases=(
            "temp", "temperature", "temp c", "process temp",
        )),
        field("pressure_bar", "Pressure", data_type="decimal", aliases=(
            "pressure", "press", "pressure bar", "process pressure",
        )),
        field("energy_kwh", "Energy consumed", data_type="decimal", aliases=(
            "energy", "kwh", "power consumed", "electricity",
        )),
        field("downtime_minutes", "Downtime", data_type="decimal", aliases=(
            "downtime", "dt minutes", "lost time", "stoppage minutes",
        )),
        field("operator", "Operator", aliases=(
            "operator name", "technician", "worker",
        )),
        field("batch_id", "Batch ID", aliases=(
            "batch", "batch number", "lot id", "lot number",
        )),
    ],

    # -------------------------------------------------------------------
    # PRODUCTION — daily production output and OEE inputs
    # -------------------------------------------------------------------
    "production": [
        field("date", "Production date", data_type="date", required=True, aliases=(
            "prod date", "manufacturing date", "run date",
        )),
        field("line", "Production line", required=True, aliases=(
            "production line", "line id", "manufacturing line", "cell",
        )),
        field("machine", "Machine", required=True, aliases=(
            "machine id", "equipment", "machine name", "asset",
        )),
        field("sku", "Product / SKU", required=True, aliases=(
            "part number", "product", "part no", "item", "component",
        )),
        field("shift", "Shift", required=True, aliases=(
            "work shift", "shift id", "shift name",
        )),
        field("order_id", "Order ID", aliases=(
            "work order", "wo", "production order", "job id",
        )),
        field("planned_quantity", "Planned quantity", data_type="decimal", required=True, aliases=(
            "planned qty", "target qty", "scheduled qty", "plan qty",
        )),
        field("actual_quantity", "Actual quantity", data_type="decimal", required=True, aliases=(
            "actual qty", "produced qty", "total produced", "output qty",
        )),
        field("good_quantity", "Good quantity", data_type="decimal", required=True, aliases=(
            "good qty", "ok qty", "passed qty", "accepted qty",
        )),
        field("rejected_quantity", "Rejected quantity", data_type="decimal", aliases=(
            "reject qty", "rejects", "scrap qty", "ng qty",
        )),
        field("reworked_quantity", "Reworked quantity", data_type="decimal", aliases=(
            "rework qty", "reworked", "rework count",
        )),
        field("batch_id", "Batch ID", aliases=(
            "batch", "batch number", "lot id", "lot number",
        )),
        field("planned_minutes", "Planned minutes", data_type="decimal", aliases=(
            "planned time", "scheduled minutes", "available minutes",
        )),
        field("downtime_minutes", "Downtime minutes", data_type="decimal", aliases=(
            "downtime", "dt minutes", "lost time", "stoppage minutes",
        )),
        field("ideal_cycle_minutes", "Ideal cycle minutes", data_type="decimal", aliases=(
            "ideal cycle", "standard cycle", "target cycle time",
        )),
    ],

    # -------------------------------------------------------------------
    # DOWNTIME — equipment / line downtime events
    # -------------------------------------------------------------------
    "downtime": [
        field("date", "Date", data_type="date", required=True, aliases=(
            "event date", "downtime date", "occurrence date",
        )),
        field("line", "Production line", required=True, aliases=(
            "production line", "line id", "manufacturing line", "cell",
        )),
        field("machine", "Machine", required=True, aliases=(
            "machine id", "equipment", "machine name", "asset",
        )),
        field("shift", "Shift", required=True, aliases=(
            "work shift", "shift id", "shift name",
        )),
        field("reason", "Downtime reason", required=True, aliases=(
            "cause", "failure reason", "downtime cause", "fault", "issue",
        )),
        field("minutes", "Minutes lost", data_type="decimal", required=True, aliases=(
            "duration", "lost minutes", "downtime minutes", "dt minutes",
        )),
        field("occurrences", "Occurrences", data_type="decimal", aliases=(
            "count", "frequency", "events", "number of events",
        )),
    ],

    # -------------------------------------------------------------------
    # QUALITY — inspection and defect data
    # -------------------------------------------------------------------
    "quality": [
        field("date", "Date", data_type="date", required=True, aliases=(
            "inspection date", "quality date", "check date",
        )),
        field("line", "Production line", required=True, aliases=(
            "production line", "line id", "manufacturing line", "cell",
        )),
        field("machine", "Machine", aliases=(
            "machine id", "equipment", "machine name", "asset",
        )),
        field("sku", "Product / SKU", required=True, aliases=(
            "part number", "product", "part no", "item", "component",
        )),
        field("shift", "Shift", required=True, aliases=(
            "work shift", "shift id", "shift name",
        )),
        field(
            "inspected_quantity", "Inspected quantity",
            data_type="decimal", required=True, aliases=(
                "inspected qty", "checked qty", "sample size", "total inspected",
            ),
        ),
        field(
            "rejected_quantity", "Rejected quantity",
            data_type="decimal", required=True, aliases=(
                "reject qty", "rejects", "defective qty", "ng qty",
            ),
        ),
        field("reworked_quantity", "Reworked quantity", data_type="decimal", aliases=(
            "rework qty", "reworked", "rework count",
        )),
        field("defect_reason", "Defect reason", required=True, aliases=(
            "defect type", "rejection reason", "defect code", "failure mode",
        )),
    ],

    # -------------------------------------------------------------------
    # INVENTORY — material stock snapshots
    # -------------------------------------------------------------------
    "inventory": [
        field("date", "Snapshot date", data_type="date", required=True, aliases=(
            "stock date", "inventory date", "as of date",
        )),
        field("material", "Material", required=True, aliases=(
            "material code", "raw material", "part number", "item",
        )),
        field("supplier", "Supplier", aliases=(
            "vendor", "supplier name", "source",
        )),
        field("unit", "Unit of measure", aliases=(
            "uom", "measure", "unit of measurement",
        )),
        field(
            "available_quantity", "Available quantity",
            data_type="decimal", required=True, aliases=(
                "available qty", "stock on hand", "qty available", "balance",
            ),
        ),
        field(
            "daily_consumption", "Daily consumption",
            data_type="decimal", required=True, aliases=(
                "daily usage", "consumption rate", "usage per day",
            ),
        ),
        field("safety_stock", "Safety stock", data_type="decimal", aliases=(
            "min stock", "reorder level", "buffer stock", "minimum quantity",
        )),
        field("expected_receipt_date", "Expected receipt date", data_type="date", aliases=(
            "eta", "expected delivery", "due in date", "arrival date",
        )),
        field("required_date", "Required date", data_type="date", aliases=(
            "need by date", "required by", "demand date",
        )),
        field("receipt_status", "Receipt status", aliases=(
            "status", "delivery status", "grn status",
        )),
    ],

    # -------------------------------------------------------------------
    # SUPPLIER — supplier delivery and quality performance
    # -------------------------------------------------------------------
    "supplier": [
        field("supplier", "Supplier", required=True, aliases=(
            "vendor", "supplier name", "source",
        )),
        field("material", "Material", required=True, aliases=(
            "material code", "raw material", "part number", "item",
        )),
        field("purchase_order", "Purchase order", required=True, aliases=(
            "po", "po number", "po #", "purchase order number",
        )),
        field("order_date", "Order date", data_type="date", required=True, aliases=(
            "po date", "purchase date", "ordered on",
        )),
        field("promised_date", "Promised delivery date", data_type="date", required=True, aliases=(
            "expected date", "committed date", "eta", "delivery due date",
        )),
        field(
            "actual_delivery_date", "Actual delivery date",
            data_type="date", required=True, aliases=(
                "delivered date", "receipt date", "grn date", "actual date",
            ),
        ),
        field("ordered_quantity", "Ordered quantity", data_type="decimal", required=True, aliases=(
            "ordered qty", "po qty", "order qty",
        )),
        field(
            "received_quantity", "Received quantity",
            data_type="decimal", required=True, aliases=(
                "received qty", "delivered qty", "grn qty",
            ),
        ),
        field(
            "accepted_quantity", "Accepted quantity",
            data_type="decimal", required=True, aliases=(
                "accepted qty", "approved qty", "passed qty", "ok qty",
            ),
        ),
        field("terms_met", "Delivery terms fulfilled", required=True, aliases=(
            "on time", "otif", "terms fulfilled", "delivery compliance",
        )),
    ],

    # -------------------------------------------------------------------
    # ORDERS — production order scheduling and status
    # -------------------------------------------------------------------
    "orders": [
        field("order_id", "Order ID", required=True, aliases=(
            "work order", "wo", "production order", "job id", "order number",
        )),
        field("sku", "Product / SKU", required=True, aliases=(
            "part number", "product", "part no", "item", "component",
        )),
        field("line", "Production line", required=True, aliases=(
            "production line", "line id", "manufacturing line", "cell",
        )),
        field(
            "required_quantity", "Required quantity",
            data_type="decimal", required=True, aliases=(
                "required qty", "demand qty", "order qty", "target qty",
            ),
        ),
        field(
            "produced_quantity", "Produced quantity",
            data_type="decimal", required=True, aliases=(
                "produced qty", "completed qty", "output qty", "made qty",
            ),
        ),
        field("due_date", "Due date", data_type="date", required=True, aliases=(
            "delivery date", "deadline", "required date", "target date",
        )),
        field("priority", "Priority", aliases=(
            "urgency", "priority level", "order priority",
        )),
        field("status", "Status", aliases=(
            "order status", "state", "current status",
        )),
    ],

    # -------------------------------------------------------------------
    # UTILITIES — boiler / energy utility logs
    # -------------------------------------------------------------------
    "utilities": [
        field("date", "Boiler log date", data_type="date", required=True, aliases=(
            "log date", "record date", "utility date",
        )),
        field("shift", "Shift", required=True, aliases=(
            "work shift", "shift id", "shift name",
        )),
        field("boiler", "Boiler", required=True, aliases=(
            "boiler id", "boiler name", "unit", "boiler unit",
        )),
        field("feedwater_kg", "Feedwater supplied", data_type="decimal", required=True, aliases=(
            "feedwater", "feed water kg", "water supplied",
        )),
        field(
            "feedwater_inlet_temperature_c", "Feedwater inlet temperature",
            data_type="decimal", required=True, aliases=(
                "inlet temp", "feedwater inlet temp", "water inlet temperature",
            ),
        ),
        field(
            "feedwater_tank_temperature_c", "Feedwater tank temperature",
            data_type="decimal", required=True, aliases=(
                "tank temp", "feedwater tank temp", "water tank temperature",
            ),
        ),
        field("steam_generated_kg", "Steam generated", data_type="decimal", required=True, aliases=(
            "steam output", "steam produced", "steam kg",
        )),
        field(
            "recovered_condensate_kg", "Recovered condensate",
            data_type="decimal", required=True, aliases=(
                "condensate", "condensate recovered", "condensate kg",
            ),
        ),
        field(
            "flash_steam_recovered_kg", "Flash steam recovered",
            data_type="decimal", required=True, aliases=(
                "flash steam", "flash recovery", "flash steam kg",
            ),
        ),
        field("briquette_used_kg", "Briquettes used", data_type="decimal", required=True, aliases=(
            "fuel used", "briquettes", "briquette kg", "solid fuel",
        )),
        field(
            "briquette_gcv_kcal_per_kg", "Briquette GCV",
            data_type="decimal", required=True, aliases=(
                "gcv", "calorific value", "fuel gcv", "briquette calorific value",
            ),
        ),
        field(
            "boiler_efficiency_percent", "Boiler efficiency",
            data_type="decimal", required=True, aliases=(
                "efficiency", "boiler efficiency %", "thermal efficiency",
            ),
        ),
    ],
}


def get_templates() -> dict[str, list[TemplateField]]:
    """Return the active template definitions for this branch."""
    return TEMPLATES


def field_rules(dataset_type):
    """Return validation rules for the given dataset type."""
    return [
        FieldRule(
            item.key, item.required, item.data_type, 0 if item.data_type == "decimal" else None
        )
        for item in TEMPLATES[dataset_type]
    ]


def serialize_fields(dataset_type):
    """Serialize template fields for API responses."""
    return [
        {
            "key": item.key,
            "label": item.display_name,
            "type": "number" if item.data_type == "decimal" else item.data_type,
            "required": item.required,
            "aliases": list(item.aliases),
        }
        for item in TEMPLATES[dataset_type]
    ]
