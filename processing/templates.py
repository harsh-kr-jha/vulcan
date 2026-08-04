from processing.mapping import TemplateField
from processing.validation import FieldRule


def field(key, label, data_type="string", required=False, aliases=()):
    return TemplateField(key, label, data_type, required, tuple(aliases))


TEMPLATES = {
    "projects": [
        field(
            "project_number",
            "Project number",
            required=True,
            aliases=["project no", "project no.", "project id", "order id"],
        ),
        field(
            "customer",
            "Customer",
            required=True,
            aliases=["customer name", "client", "customer name."],
        ),
        field(
            "project_name",
            "Project name",
            required=True,
            aliases=["project name.", "project description", "description"],
        ),
        field("po_number", "Purchase order number", aliases=["po no", "po no.", "po number"]),
        field("category", "Category", aliases=["project category"]),
        field("quantity", "Quantity", "decimal", aliases=["qty", "order quantity"]),
        field("uom", "Unit of measure", aliases=["unit of measure", "unit"]),
        field(
            "factory_unit",
            "Factory unit",
            aliases=["unit-i / unit-ii", "unit i / unit ii", "plant", "factory"],
        ),
        field("order_value", "Order value", "decimal", aliases=["po value", "project value"]),
        field(
            "po_received_date",
            "PO received date",
            "date",
            aliases=["po received date.", "purchase order date"],
        ),
        field("start_date", "Project start date", "date", aliases=["date", "project date"]),
        field(
            "customer_due_date",
            "Customer expected delivery date",
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
            "Factory commitment date",
            "date",
            aliases=["ig commitment date", "committed date"],
        ),
        field(
            "dispatch_date",
            "Dispatch date",
            "date",
            aliases=["ig dispatch date.", "actual dispatch date"],
        ),
        field("priority", "Priority", aliases=["project priority"]),
        field("status", "Project status", aliases=["current status"]),
        field(
            "progress",
            "Overall completion percent",
            "decimal",
            aliases=["overall progress", "completion %", "project progress"],
        ),
        field(
            "assigned_team",
            "Assigned team",
            aliases=["project team", "team", "assigned people"],
        ),
    ],
    "project_stages": [
        field(
            "project_number",
            "Project number",
            required=True,
            aliases=["project no", "project no.", "project id", "order id"],
        ),
        field("stage_code", "Stage code", required=True, aliases=["operation code"]),
        field(
            "stage_name",
            "Stage name",
            required=True,
            aliases=["stage", "operation", "process", "manufacturing stage"],
        ),
        field("sequence", "Sequence", "decimal", True, ["stage sequence", "order"]),
        field(
            "stage_status",
            "Stage status",
            required=True,
            aliases=["status", "current status"],
        ),
        field("progress", "Completion percent", "decimal", True, ["progress", "completion %"]),
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
            "Assigned person",
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
        field("date", "Process date", "date", True, ["date", "operational date"]),
        field("line", "Production line", required=True, aliases=["line", "line name"]),
        field("process", "Manufacturing process", required=True, aliases=["stage", "operation"]),
        field("machine", "Machine", required=True, aliases=["equipment", "asset"]),
        field("shift", "Shift", required=True, aliases=["shift name"]),
        field("status", "Process state", required=True, aliases=["state", "machine status"]),
        field("input_quantity", "Input quantity", "decimal", True, ["input", "feed quantity"]),
        field("output_quantity", "Output quantity", "decimal", True, ["output", "produced"]),
        field("rejected_quantity", "Rejected quantity", "decimal", aliases=["rejects", "scrap"]),
        field("run_minutes", "Run minutes", "decimal", aliases=["operating minutes", "runtime"]),
        field(
            "cycle_time_minutes",
            "Cycle time",
            "decimal",
            aliases=["cycle time", "minutes per cycle"],
        ),
        field("temperature_c", "Temperature", "decimal", aliases=["temperature", "temp c"]),
        field("pressure_bar", "Pressure", "decimal", aliases=["pressure"]),
        field("energy_kwh", "Energy consumed", "decimal", aliases=["energy", "power consumption"]),
        field("downtime_minutes", "Downtime", "decimal", aliases=["downtime", "stop minutes"]),
        field("operator", "Operator", aliases=["operator name"]),
        field("batch_id", "Batch ID", aliases=["batch", "lot"]),
    ],
    "production": [
        field("date", "Production date", "date", True, ["date", "operational date"]),
        field("line", "Production line", required=True, aliases=["line", "line name"]),
        field("machine", "Machine", required=True, aliases=["machine", "equipment"]),
        field("sku", "Product / SKU", required=True, aliases=["sku", "product", "item code"]),
        field("shift", "Shift", required=True, aliases=["shift", "shift name"]),
        field("order_id", "Order ID", aliases=["order", "production order"]),
        field("planned_quantity", "Planned quantity", "decimal", True, ["plan", "target output"]),
        field("actual_quantity", "Actual quantity", "decimal", True, ["actual output", "output"]),
        field("good_quantity", "Good quantity", "decimal", True, ["accepted qty", "good output"]),
        field("rejected_quantity", "Rejected quantity", "decimal", aliases=["reject qty", "scrap"]),
        field("reworked_quantity", "Reworked quantity", "decimal", aliases=["rework"]),
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
        field("line", "Production line", required=True, aliases=["line"]),
        field("machine", "Machine", required=True, aliases=["equipment"]),
        field("shift", "Shift", required=True),
        field("reason", "Downtime reason", required=True, aliases=["reason", "reason code"]),
        field("minutes", "Minutes lost", "decimal", True, ["duration", "downtime minutes"]),
        field("occurrences", "Occurrences", "decimal", aliases=["count", "stops"]),
    ],
    "quality": [
        field("date", "Date", "date", True, ["quality date"]),
        field("line", "Production line", required=True),
        field("machine", "Machine"),
        field("sku", "Product / SKU", required=True, aliases=["product", "item"]),
        field("shift", "Shift", required=True),
        field(
            "inspected_quantity",
            "Inspected quantity",
            "decimal",
            True,
            ["inspected", "total inspected"],
        ),
        field(
            "rejected_quantity",
            "Rejected quantity",
            "decimal",
            True,
            ["rejected", "reject qty", "scrap"],
        ),
        field("reworked_quantity", "Reworked quantity", "decimal", aliases=["rework", "reworked"]),
        field(
            "defect_reason", "Defect reason", required=True, aliases=["defect", "rejection reason"]
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
}


def field_rules(dataset_type):
    return [
        FieldRule(
            item.key, item.required, item.data_type, 0 if item.data_type == "decimal" else None
        )
        for item in TEMPLATES[dataset_type]
    ]


def serialize_fields(dataset_type):
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
