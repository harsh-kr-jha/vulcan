"""
Dataset field templates for the Tamaso platform.

Operating template branch: MFG.PMC.AGRI.ALL
Industry: Mushroom cultivation / controlled-environment agriculture.

This module populates the TEMPLATES dictionary with field definitions specific
to mushroom farming operations — crop cycles, harvest data, room observations,
crop quality, and room downtime tracking.
"""

from processing.mapping import TemplateField
from processing.validation import FieldRule


def field(key, label, data_type="string", required=False, aliases=()):
    """Create a TemplateField with sensible defaults."""
    return TemplateField(key, label, data_type, required, tuple(aliases))


# ---------------------------------------------------------------------------
# Dataset templates — MFG.PMC.AGRI.ALL (Mushroom Cultivation)
#
# "projects"       = crop cycles (batch tracking)
# "production"     = harvest data
# "process"        = room observations (climate / substrate monitoring)
# "quality"        = crop quality (contamination, grading)
# "downtime"       = room / equipment downtime
# "inventory"      = growing supplies & spawn stock
# "supplier"       = substrate & supply-chain vendors
# "orders"         = customer dispatch orders
# "utilities"      = boiler / steam / energy
# ---------------------------------------------------------------------------

TEMPLATES: dict[str, list[TemplateField]] = {
    # ------------------------------------------------------------------
    # PROJECTS — Crop cycles / batch tracking
    # ------------------------------------------------------------------
    "projects": [
        field(
            "project_number",
            "Crop batch number",
            required=True,
            aliases=("batch", "crop batch", "batch number", "crop id", "cycle id"),
        ),
        field(
            "customer",
            "Customer / crop programme",
            required=True,
            aliases=("programme", "crop programme", "buyer", "customer name"),
        ),
        field(
            "project_name",
            "Crop cycle name",
            required=True,
            aliases=("cycle name", "crop cycle", "crop name", "batch name"),
        ),
        field(
            "po_number",
            "Sales / programme reference",
            aliases=("sales ref", "programme ref", "po", "purchase order"),
        ),
        field(
            "category",
            "Mushroom variety",
            aliases=("variety", "species", "strain", "mushroom type", "crop type"),
        ),
        field(
            "quantity",
            "Planned harvest quantity",
            data_type="decimal",
            aliases=("planned kg", "target harvest", "planned quantity", "harvest target"),
        ),
        field(
            "uom",
            "Unit of measure",
            aliases=("unit", "measure", "uom"),
        ),
        field(
            "factory_unit",
            "Growing wing",
            aliases=("wing", "growing wing", "farm unit", "house", "growing house", "tunnel"),
        ),
        field(
            "order_value",
            "Expected crop value",
            data_type="decimal",
            aliases=("crop value", "expected value", "harvest value", "revenue"),
        ),
        field(
            "po_received_date",
            "Programme received date",
            data_type="date",
            aliases=("received date", "order date", "programme date"),
        ),
        field(
            "start_date",
            "Spawn / crop start date",
            data_type="date",
            aliases=("spawn date", "spawning date", "crop start", "inoculation date", "start"),
        ),
        field(
            "customer_due_date",
            "Expected first dispatch date",
            data_type="date",
            aliases=("first dispatch", "due date", "first harvest date", "dispatch due"),
        ),
        field(
            "commitment_date",
            "Expected final harvest date",
            data_type="date",
            aliases=("final harvest", "crop end", "last flush date", "commitment"),
        ),
        field(
            "dispatch_date",
            "Actual final harvest date",
            data_type="date",
            aliases=("actual harvest end", "final pick date", "last harvest"),
        ),
        field(
            "priority",
            "Crop priority",
            aliases=("priority", "urgency", "crop priority"),
        ),
        field(
            "status",
            "Crop cycle status",
            aliases=("cycle status", "crop status", "batch status", "state"),
        ),
        field(
            "progress",
            "Crop cycle completion percent",
            data_type="decimal",
            aliases=("completion", "percent complete", "progress", "cycle progress"),
        ),
        field(
            "assigned_team",
            "Assigned crop team",
            aliases=("crop team", "growers", "team", "assigned to", "farm team"),
        ),
    ],
    # ------------------------------------------------------------------
    # PROJECT STAGES — Crop stage tracking
    # ------------------------------------------------------------------
    "project_stages": [
        field(
            "project_number",
            "Crop batch number",
            required=True,
            aliases=("batch", "crop batch", "batch number", "crop id"),
        ),
        field(
            "stage_code",
            "Crop stage code",
            required=True,
            aliases=("stage code", "phase code", "cultivation code"),
        ),
        field(
            "stage_name",
            "Crop stage name",
            required=True,
            aliases=(
                "stage", "phase", "cultivation stage", "stage name",
                "spawning", "colonisation", "pinning", "fruiting",
            ),
        ),
        field(
            "sequence",
            "Sequence",
            data_type="decimal",
            required=True,
            aliases=("order", "seq", "step number"),
        ),
        field(
            "stage_status",
            "Crop stage status",
            required=True,
            aliases=("status", "phase status", "stage state"),
        ),
        field(
            "progress",
            "Stage completion percent",
            data_type="decimal",
            required=True,
            aliases=("completion", "percent", "stage progress"),
        ),
        field(
            "planned_start",
            "Planned start date",
            data_type="date",
            required=True,
            aliases=("planned start", "target start"),
        ),
        field(
            "actual_start",
            "Actual start date",
            data_type="date",
            aliases=("actual start", "real start"),
        ),
        field(
            "planned_completion",
            "Planned completion date",
            data_type="date",
            required=True,
            aliases=("planned end", "target completion", "planned finish"),
        ),
        field(
            "actual_completion",
            "Actual completion date",
            data_type="date",
            aliases=("actual end", "real completion", "actual finish"),
        ),
        field(
            "assigned_to",
            "Crop owner",
            aliases=("owner", "grower", "assigned", "responsible"),
        ),
        field(
            "delay_days",
            "Delay days",
            data_type="decimal",
            aliases=("delay", "days late", "overdue days"),
        ),
        field(
            "notes",
            "Notes",
            aliases=("comments", "remarks", "observations"),
        ),
        field(
            "attachments",
            "Attachment names or links",
            aliases=("files", "documents", "photos", "images"),
        ),
    ],
    # ------------------------------------------------------------------
    # PROCESS — Room observations (climate / substrate monitoring)
    # ------------------------------------------------------------------
    "process": [
        field(
            "date",
            "Observation date",
            data_type="date",
            required=True,
            aliases=("obs date", "reading date", "date", "record date"),
        ),
        field(
            "line",
            "Growing wing / compost line",
            required=True,
            aliases=(
                "wing", "growing wing", "compost line", "line",
                "farm section", "tunnel", "house",
            ),
        ),
        field(
            "process",
            "Cultivation stage",
            required=True,
            aliases=(
                "stage", "cultivation stage", "growing stage", "phase",
                "spawning", "colonisation", "pinning", "fruiting", "conditioning",
            ),
        ),
        field(
            "machine",
            "Growing room / process asset",
            required=True,
            aliases=(
                "room", "growing room", "chamber", "tunnel", "asset",
                "climate unit", "process asset",
            ),
        ),
        field(
            "shift",
            "Observation round",
            required=True,
            aliases=("round", "obs round", "shift", "check", "inspection round"),
        ),
        field(
            "status",
            "Room / stage state",
            required=True,
            aliases=("state", "room status", "condition", "room state"),
        ),
        field(
            "input_quantity",
            "Material or crop input",
            data_type="decimal",
            required=True,
            aliases=("input", "material input", "substrate input", "spawn input", "compost input"),
        ),
        field(
            "output_quantity",
            "Stage output",
            data_type="decimal",
            required=True,
            aliases=("output", "stage output", "yield", "harvest output"),
        ),
        field(
            "rejected_quantity",
            "Contaminated / discarded quantity",
            data_type="decimal",
            aliases=("contaminated", "rejected", "discarded", "waste", "contamination qty"),
        ),
        field(
            "run_minutes",
            "Active minutes",
            data_type="decimal",
            aliases=("run time", "active time", "minutes active"),
        ),
        field(
            "cycle_time_minutes",
            "Stage cycle time",
            data_type="decimal",
            aliases=("cycle time", "stage time", "duration"),
        ),
        field(
            "temperature_c",
            "Temperature",
            data_type="decimal",
            aliases=("temp", "temperature", "air temp", "room temp", "degrees"),
        ),
        field(
            "humidity_pct",
            "Relative humidity",
            data_type="decimal",
            aliases=("humidity", "rh", "relative humidity", "moisture", "air moisture"),
        ),
        field(
            "co2_ppm",
            "Carbon dioxide",
            data_type="decimal",
            aliases=("co2", "carbon dioxide", "co2 level", "co2 ppm"),
        ),
        field(
            "substrate_moisture_pct",
            "Substrate moisture",
            data_type="decimal",
            aliases=(
                "substrate moisture", "compost moisture", "bed moisture",
                "substrate water content",
            ),
        ),
        field(
            "water_litres",
            "Water applied",
            data_type="decimal",
            aliases=("water", "irrigation", "litres", "watering", "misting"),
        ),
        field(
            "treatment",
            "Treatment / chemical",
            aliases=(
                "chemical", "treatment", "spray", "fungicide", "pesticide",
                "disinfectant", "additive",
            ),
        ),
        field(
            "treatment_quantity",
            "Treatment quantity",
            data_type="decimal",
            aliases=("treatment qty", "chemical qty", "spray volume", "dose"),
        ),
        field(
            "temperature_min_c",
            "Temperature target minimum",
            data_type="decimal",
            aliases=("temp min", "min temp", "temperature min", "low temp target"),
        ),
        field(
            "temperature_max_c",
            "Temperature target maximum",
            data_type="decimal",
            aliases=("temp max", "max temp", "temperature max", "high temp target"),
        ),
        field(
            "humidity_min_pct",
            "Humidity target minimum",
            data_type="decimal",
            aliases=("humidity min", "min humidity", "rh min", "low humidity target"),
        ),
        field(
            "humidity_max_pct",
            "Humidity target maximum",
            data_type="decimal",
            aliases=("humidity max", "max humidity", "rh max", "high humidity target"),
        ),
        field(
            "co2_max_ppm",
            "CO2 target maximum",
            data_type="decimal",
            aliases=("co2 max", "max co2", "co2 limit", "co2 ceiling"),
        ),
        field(
            "pressure_bar",
            "Pressure",
            data_type="decimal",
            aliases=("pressure", "air pressure", "bar"),
        ),
        field(
            "energy_kwh",
            "Energy consumed",
            data_type="decimal",
            aliases=("energy", "kwh", "power", "electricity"),
        ),
        field(
            "downtime_minutes",
            "Downtime",
            data_type="decimal",
            aliases=("downtime", "lost time", "idle minutes"),
        ),
        field(
            "operator",
            "Grower / operator",
            aliases=("grower", "operator", "technician", "farm worker", "attendant"),
        ),
        field(
            "batch_id",
            "Crop batch ID",
            aliases=("batch", "crop batch", "batch id", "crop id", "cycle id"),
        ),
    ],
    # ------------------------------------------------------------------
    # PRODUCTION — Harvest data
    # ------------------------------------------------------------------
    "production": [
        field(
            "date",
            "Harvest date",
            data_type="date",
            required=True,
            aliases=("pick date", "harvest date", "date", "picking date"),
        ),
        field(
            "line",
            "Growing wing",
            required=True,
            aliases=("wing", "growing wing", "farm section", "tunnel", "house"),
        ),
        field(
            "machine",
            "Growing room",
            required=True,
            aliases=("room", "growing room", "chamber", "tunnel", "picking room"),
        ),
        field(
            "sku",
            "Mushroom variety / grade",
            required=True,
            aliases=(
                "variety", "grade", "mushroom type", "species", "strain",
                "product", "sku", "mushroom grade",
            ),
        ),
        field(
            "shift",
            "Harvest shift",
            required=True,
            aliases=("shift", "pick shift", "harvest round", "picking shift"),
        ),
        field(
            "order_id",
            "Customer / harvest order ID",
            aliases=("order", "order id", "customer order", "dispatch order"),
        ),
        field(
            "planned_quantity",
            "Planned harvest kg",
            data_type="decimal",
            required=True,
            aliases=("planned", "target kg", "planned kg", "expected harvest"),
        ),
        field(
            "actual_quantity",
            "Total harvested kg",
            data_type="decimal",
            required=True,
            aliases=("actual", "harvested", "total kg", "picked kg", "actual harvest"),
        ),
        field(
            "good_quantity",
            "Saleable Grade A kg",
            data_type="decimal",
            required=True,
            aliases=("grade a", "saleable", "good kg", "premium", "first grade"),
        ),
        field(
            "rejected_quantity",
            "Discarded / contaminated kg",
            data_type="decimal",
            aliases=("rejected", "contaminated", "waste kg", "discarded", "bin"),
        ),
        field(
            "reworked_quantity",
            "Downgraded Grade B kg",
            data_type="decimal",
            aliases=("grade b", "downgraded", "rework", "second grade", "processing grade"),
        ),
        field(
            "batch_id",
            "Crop batch ID",
            aliases=("batch", "crop batch", "batch id", "crop id", "cycle id"),
        ),
        field(
            "flush_number",
            "Flush number",
            data_type="decimal",
            aliases=("flush", "flush no", "flush num", "break", "picking flush"),
        ),
        field(
            "substrate_dry_kg",
            "Dry substrate input kg",
            data_type="decimal",
            aliases=(
                "substrate", "dry substrate", "compost kg", "substrate weight",
                "bed weight", "substrate dry",
            ),
        ),
        field(
            "growing_area_m2",
            "Growing area",
            data_type="decimal",
            aliases=("area", "growing area", "bed area", "m2", "square metres", "tray area"),
        ),
        field(
            "water_litres",
            "Water applied",
            data_type="decimal",
            aliases=("water", "irrigation", "litres", "watering", "misting"),
        ),
        field(
            "crop_age_days",
            "Crop age",
            data_type="decimal",
            aliases=("age", "crop age", "days", "days since spawn", "growing days"),
        ),
        field(
            "planned_minutes",
            "Planned minutes",
            data_type="decimal",
            aliases=("planned time", "target minutes", "scheduled minutes"),
        ),
        field(
            "downtime_minutes",
            "Downtime minutes",
            data_type="decimal",
            aliases=("downtime", "lost time", "idle minutes"),
        ),
        field(
            "ideal_cycle_minutes",
            "Ideal cycle minutes",
            data_type="decimal",
            aliases=("ideal cycle", "target cycle", "standard minutes"),
        ),
    ],
    # ------------------------------------------------------------------
    # DOWNTIME — Room / equipment downtime
    # ------------------------------------------------------------------
    "downtime": [
        field(
            "date",
            "Date",
            data_type="date",
            required=True,
            aliases=("date", "event date", "downtime date"),
        ),
        field(
            "line",
            "Growing wing",
            required=True,
            aliases=("wing", "growing wing", "farm section", "tunnel"),
        ),
        field(
            "machine",
            "Room / climate asset",
            required=True,
            aliases=(
                "room", "growing room", "asset", "climate unit",
                "hvac", "equipment", "humidifier", "boiler",
            ),
        ),
        field(
            "shift",
            "Observation round",
            required=True,
            aliases=("round", "shift", "check", "inspection round"),
        ),
        field(
            "reason",
            "Room / equipment downtime reason",
            required=True,
            aliases=(
                "reason", "cause", "fault", "failure", "breakdown",
                "climate fault", "contamination event",
            ),
        ),
        field(
            "minutes",
            "Minutes lost",
            data_type="decimal",
            required=True,
            aliases=("duration", "lost minutes", "minutes", "time lost", "downtime minutes"),
        ),
        field(
            "occurrences",
            "Occurrences",
            data_type="decimal",
            aliases=("count", "events", "occurrences", "frequency"),
        ),
    ],
    # ------------------------------------------------------------------
    # QUALITY — Crop quality / contamination / grading
    # ------------------------------------------------------------------
    "quality": [
        field(
            "date",
            "Inspection / harvest date",
            data_type="date",
            required=True,
            aliases=("date", "inspection date", "harvest date", "check date"),
        ),
        field(
            "line",
            "Growing wing",
            required=True,
            aliases=("wing", "growing wing", "farm section", "tunnel"),
        ),
        field(
            "machine",
            "Growing room",
            aliases=("room", "growing room", "chamber", "tunnel"),
        ),
        field(
            "sku",
            "Mushroom variety / grade",
            required=True,
            aliases=(
                "variety", "grade", "mushroom type", "species", "strain",
                "product", "mushroom grade",
            ),
        ),
        field(
            "shift",
            "Harvest shift",
            required=True,
            aliases=("shift", "pick shift", "harvest round", "inspection shift"),
        ),
        field(
            "inspected_quantity",
            "Inspected harvest kg",
            data_type="decimal",
            required=True,
            aliases=("inspected", "checked kg", "sample kg", "inspected qty"),
        ),
        field(
            "rejected_quantity",
            "Discarded / contaminated kg",
            data_type="decimal",
            required=True,
            aliases=("rejected", "contaminated", "waste kg", "discarded", "defect kg"),
        ),
        field(
            "reworked_quantity",
            "Downgraded Grade B kg",
            data_type="decimal",
            aliases=("grade b", "downgraded", "rework", "second grade", "processing grade"),
        ),
        field(
            "defect_reason",
            "Crop quality / contamination reason",
            required=True,
            aliases=(
                "reason", "defect", "contamination", "quality issue",
                "mould", "mold", "trichoderma", "bacterial blotch",
                "bruising", "discolouration", "pest damage",
            ),
        ),
    ],
    # ------------------------------------------------------------------
    # INVENTORY — Growing supplies & spawn stock
    # ------------------------------------------------------------------
    "inventory": [
        field(
            "date",
            "Stock date",
            data_type="date",
            required=True,
            aliases=("date", "stock date", "count date", "inventory date"),
        ),
        field(
            "warehouse",
            "Store / cold room",
            required=True,
            aliases=(
                "store", "cold room", "warehouse", "spawn store",
                "chemical store", "cold store",
            ),
        ),
        field(
            "sku",
            "Material / supply SKU",
            required=True,
            aliases=(
                "sku", "material", "item", "product", "supply",
                "spawn", "substrate", "compost", "casing",
            ),
        ),
        field(
            "description",
            "Description",
            aliases=("desc", "item name", "material name", "supply name"),
        ),
        field(
            "category",
            "Category",
            aliases=(
                "type", "group", "class", "growing supplies",
                "spawn stock", "packaging", "chemicals",
            ),
        ),
        field(
            "quantity_on_hand",
            "Quantity on hand",
            data_type="decimal",
            required=True,
            aliases=("on hand", "stock", "qty", "balance", "available"),
        ),
        field(
            "uom",
            "Unit of measure",
            aliases=("unit", "measure", "uom"),
        ),
        field(
            "reorder_level",
            "Reorder level",
            data_type="decimal",
            aliases=("reorder", "min stock", "safety stock", "reorder point"),
        ),
        field(
            "unit_cost",
            "Unit cost",
            data_type="decimal",
            aliases=("cost", "price", "unit price"),
        ),
        field(
            "total_value",
            "Total stock value",
            data_type="decimal",
            aliases=("value", "stock value", "total cost"),
        ),
        field(
            "supplier",
            "Supplier",
            aliases=("vendor", "supplier name", "source"),
        ),
        field(
            "last_received",
            "Last received date",
            data_type="date",
            aliases=("received", "last delivery", "last receipt"),
        ),
        field(
            "expiry_date",
            "Expiry date",
            data_type="date",
            aliases=("expiry", "use by", "best before", "shelf life end"),
        ),
    ],
    # ------------------------------------------------------------------
    # SUPPLIER — Substrate & supply-chain vendors
    # ------------------------------------------------------------------
    "supplier": [
        field(
            "supplier_code",
            "Supplier code",
            required=True,
            aliases=("code", "vendor code", "supplier id"),
        ),
        field(
            "supplier_name",
            "Supplier name",
            required=True,
            aliases=("name", "vendor", "supplier", "company"),
        ),
        field(
            "category",
            "Supplier category",
            aliases=(
                "type", "group", "class", "spawn supplier",
                "substrate supplier", "packaging supplier",
            ),
        ),
        field(
            "contact_name",
            "Contact name",
            aliases=("contact", "representative", "rep"),
        ),
        field(
            "email",
            "Email",
            aliases=("email address", "contact email"),
        ),
        field(
            "phone",
            "Phone",
            aliases=("telephone", "contact number", "mobile"),
        ),
        field(
            "address",
            "Address",
            aliases=("location", "site address", "postal address"),
        ),
        field(
            "lead_time_days",
            "Lead time days",
            data_type="decimal",
            aliases=("lead time", "delivery days", "turnaround"),
        ),
        field(
            "rating",
            "Supplier rating",
            aliases=("score", "performance", "grade"),
        ),
        field(
            "status",
            "Supplier status",
            aliases=("state", "active", "approved"),
        ),
        field(
            "last_delivery",
            "Last delivery date",
            data_type="date",
            aliases=("last order", "last receipt", "recent delivery"),
        ),
        field(
            "notes",
            "Notes",
            aliases=("comments", "remarks"),
        ),
    ],
    # ------------------------------------------------------------------
    # ORDERS — Customer dispatch orders
    # ------------------------------------------------------------------
    "orders": [
        field(
            "order_id",
            "Order ID",
            required=True,
            aliases=("order", "order number", "dispatch id", "sales order"),
        ),
        field(
            "customer",
            "Customer",
            required=True,
            aliases=("buyer", "client", "retailer", "customer name"),
        ),
        field(
            "order_date",
            "Order date",
            data_type="date",
            required=True,
            aliases=("date", "placed date", "created date"),
        ),
        field(
            "due_date",
            "Due date",
            data_type="date",
            aliases=("delivery date", "dispatch date", "required date"),
        ),
        field(
            "sku",
            "Mushroom variety / grade",
            required=True,
            aliases=("variety", "product", "grade", "mushroom type", "item"),
        ),
        field(
            "quantity",
            "Order quantity kg",
            data_type="decimal",
            required=True,
            aliases=("qty", "kg", "order kg", "amount"),
        ),
        field(
            "uom",
            "Unit of measure",
            aliases=("unit", "measure"),
        ),
        field(
            "unit_price",
            "Unit price",
            data_type="decimal",
            aliases=("price", "rate", "price per kg"),
        ),
        field(
            "order_value",
            "Order value",
            data_type="decimal",
            aliases=("value", "total", "revenue", "line value"),
        ),
        field(
            "status",
            "Order status",
            aliases=("state", "dispatch status", "fulfilment"),
        ),
        field(
            "dispatched_quantity",
            "Dispatched quantity kg",
            data_type="decimal",
            aliases=("dispatched", "shipped", "delivered kg"),
        ),
        field(
            "dispatch_date",
            "Actual dispatch date",
            data_type="date",
            aliases=("shipped date", "delivery date", "sent date"),
        ),
        field(
            "batch_id",
            "Crop batch ID",
            aliases=("batch", "crop batch", "source batch"),
        ),
        field(
            "notes",
            "Notes",
            aliases=("comments", "remarks", "instructions"),
        ),
    ],
    # ------------------------------------------------------------------
    # UTILITIES — Boiler / steam / energy
    # ------------------------------------------------------------------
    "utilities": [
        field(
            "date",
            "Reading date",
            data_type="date",
            required=True,
            aliases=("date", "meter date", "record date"),
        ),
        field(
            "utility_type",
            "Utility type",
            required=True,
            aliases=(
                "type", "service", "energy type", "steam", "gas",
                "electricity", "water", "diesel",
            ),
        ),
        field(
            "meter_id",
            "Meter ID",
            required=True,
            aliases=("meter", "meter number", "asset", "sensor id"),
        ),
        field(
            "location",
            "Location",
            aliases=("wing", "growing wing", "room", "boiler house", "plant room"),
        ),
        field(
            "reading",
            "Meter reading",
            data_type="decimal",
            required=True,
            aliases=("value", "reading", "consumption", "usage"),
        ),
        field(
            "uom",
            "Unit of measure",
            aliases=("unit", "measure", "kwh", "litres", "m3", "therms"),
        ),
        field(
            "consumption",
            "Period consumption",
            data_type="decimal",
            aliases=("usage", "period usage", "delta", "consumed"),
        ),
        field(
            "cost",
            "Cost",
            data_type="decimal",
            aliases=("charge", "expense", "amount", "bill"),
        ),
        field(
            "shift",
            "Shift / period",
            aliases=("period", "shift", "time block"),
        ),
        field(
            "notes",
            "Notes",
            aliases=("comments", "remarks"),
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
