"""Generate upload-ready mock Project master and Project stages workbooks."""

from datetime import date, timedelta
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.worksheet.table import Table, TableStyleInfo

OUTPUT_DIR = Path(__file__).resolve().parent

PROJECT_HEADERS = [
    "project_number",
    "customer",
    "project_name",
    "po_number",
    "category",
    "quantity",
    "uom",
    "factory_unit",
    "order_value",
    "po_received_date",
    "start_date",
    "customer_due_date",
    "commitment_date",
    "dispatch_date",
    "priority",
    "status",
    "progress",
    "assigned_team",
]

STAGE_HEADERS = [
    "project_number",
    "stage_code",
    "stage_name",
    "sequence",
    "stage_status",
    "progress",
    "planned_start",
    "actual_start",
    "planned_completion",
    "actual_completion",
    "assigned_to",
    "delay_days",
    "notes",
    "attachments",
]

PROJECTS = [
    {
        "project_number": "IG-2026-047",
        "customer": "Apex Life Sciences",
        "project_name": "Purified Water Distribution Skid",
        "po_number": "PO/APEX/4821",
        "category": "Process Equipment",
        "quantity": 1,
        "uom": "Set",
        "factory_unit": "Unit-I",
        "order_value": 4_850_000,
        "po_received_date": date(2026, 7, 25),
        "start_date": date(2026, 7, 28),
        "customer_due_date": date(2026, 8, 24),
        "commitment_date": date(2026, 8, 24),
        "dispatch_date": "",
        "priority": "High",
        "status": "In Progress",
        "progress": 58,
        "assigned_team": (
            "Nisha Rao|Project lead; Imran Shaikh|Production; "
            "Meera Patil|Quality; Ajay Kumar|Procurement"
        ),
        "stage_progress": [100, 100, 100, 100, 100, 20, 0, 0, 0],
        "delayed_stage": None,
    },
    {
        "project_number": "IG-2026-048",
        "customer": "Nova Biologics",
        "project_name": "Automated CIP Module",
        "po_number": "PO/NOVA/9914",
        "category": "Process Equipment",
        "quantity": 2,
        "uom": "Nos",
        "factory_unit": "Unit-II",
        "order_value": 7_200_000,
        "po_received_date": date(2026, 7, 23),
        "start_date": date(2026, 7, 27),
        "customer_due_date": date(2026, 8, 18),
        "commitment_date": date(2026, 8, 18),
        "dispatch_date": "",
        "priority": "Critical",
        "status": "Delayed",
        "progress": 42,
        "assigned_team": (
            "Nisha Rao|Project lead; Ravi Joshi|Fabrication; "
            "Meera Patil|Quality; Ajay Kumar|Procurement"
        ),
        "stage_progress": [100, 100, 100, 75, 0, 0, 0, 0, 0],
        "delayed_stage": 4,
    },
    {
        "project_number": "IG-2026-050",
        "customer": "Zenith Process Systems",
        "project_name": "Jacketed Mixing Vessel – 2 KL",
        "po_number": "PO/ZEN/3378",
        "category": "Storage & Mixing",
        "quantity": 1,
        "uom": "Nos",
        "factory_unit": "Unit-I",
        "order_value": 3_650_000,
        "po_received_date": date(2026, 7, 20),
        "start_date": date(2026, 7, 24),
        "customer_due_date": date(2026, 8, 20),
        "commitment_date": date(2026, 8, 20),
        "dispatch_date": "",
        "priority": "High",
        "status": "In Progress",
        "progress": 83,
        "assigned_team": (
            "Karthik S.|Project lead; Imran Shaikh|Production; "
            "Meera Patil|Quality"
        ),
        "stage_progress": [100, 100, 100, 100, 100, 100, 100, 50, 0],
        "delayed_stage": None,
    },
    {
        "project_number": "IG-2026-051",
        "customer": "Orion Healthcare",
        "project_name": "Material Transfer Trolley Set",
        "po_number": "PO/ORION/7350",
        "category": "Material Handling",
        "quantity": 6,
        "uom": "Nos",
        "factory_unit": "Unit-II",
        "order_value": 980_000,
        "po_received_date": date(2026, 7, 8),
        "start_date": date(2026, 7, 12),
        "customer_due_date": date(2026, 8, 5),
        "commitment_date": date(2026, 8, 5),
        "dispatch_date": date(2026, 8, 4),
        "priority": "Medium",
        "status": "Completed",
        "progress": 100,
        "assigned_team": (
            "Karthik S.|Project lead; Ravi Joshi|Fabrication; "
            "Sandeep R.|Dispatch"
        ),
        "stage_progress": [100, 100, 100, 100, 100, 100, 100, 100, 100],
        "delayed_stage": None,
    },
    {
        "project_number": "IG-2026-054",
        "customer": "Prism Laboratories",
        "project_name": "Process Piping Manifold",
        "po_number": "PO/PRISM/2408",
        "category": "Piping",
        "quantity": 4,
        "uom": "Sets",
        "factory_unit": "Unit-I",
        "order_value": 2_120_000,
        "po_received_date": date(2026, 7, 29),
        "start_date": date(2026, 8, 1),
        "customer_due_date": date(2026, 9, 1),
        "commitment_date": date(2026, 9, 1),
        "dispatch_date": "",
        "priority": "Medium",
        "status": "In Progress",
        "progress": 24,
        "assigned_team": (
            "Nisha Rao|Project lead; Imran Shaikh|Production; "
            "Meera Patil|Quality"
        ),
        "stage_progress": [100, 100, 20, 0, 0, 0, 0, 0, 0],
        "delayed_stage": None,
    },
    {
        "project_number": "IG-2026-057",
        "customer": "Saffron Chemicals",
        "project_name": "SS316L Buffer Storage Tank",
        "po_number": "PO/SAF/1156",
        "category": "Storage & Mixing",
        "quantity": 2,
        "uom": "Nos",
        "factory_unit": "Unit-II",
        "order_value": 5_420_000,
        "po_received_date": date(2026, 8, 3),
        "start_date": date(2026, 8, 20),
        "customer_due_date": date(2026, 9, 12),
        "commitment_date": date(2026, 9, 12),
        "dispatch_date": "",
        "priority": "Low",
        "status": "Not Started",
        "progress": 0,
        "assigned_team": "Karthik S.|Project lead; Ajay Kumar|Procurement",
        "stage_progress": [0, 0, 0, 0, 0, 0, 0, 0, 0],
        "delayed_stage": None,
    },
]

WORKFLOW = [
    ("RAW-MATERIAL", "Raw Material Delivery", 3, "Ajay Kumar"),
    ("PROCESS-OPS", "Process Operations", 2, "Nisha Rao"),
    ("PROFILE-CUT", "Profile Cutting", 2, "Imran Shaikh"),
    ("BENDING", "Bending", 2, "Ravi Joshi"),
    ("MACHINING", "Machining", 4, "Karthik S."),
    ("FABRICATION", "Other fabrication processes", 3, "Ravi Joshi"),
    ("WELDING", "Welding", 4, "Imran Shaikh"),
    ("POLISHING", "Polishing", 2, "Meera Patil"),
    ("PACKING", "Packing", 2, "Sandeep R."),
]


def stage_status(progress, delayed):
    if delayed:
        return "Delayed"
    if progress == 100:
        return "Completed"
    if progress > 0:
        return "In Progress"
    return "Not Started"


def stage_note(name, status):
    if status == "Completed":
        return f"{name} inspection completed and released to the next operation."
    if status == "Delayed":
        return "Capacity conflict identified; recovery sequence is under planning review."
    if status == "In Progress":
        return f"{name} is progressing against the latest shop-floor update."
    return "Awaiting release from the preceding operation."


def attachment_refs(code, status):
    if code == "RAW-MATERIAL" and status == "Completed":
        return "material-test-certificate.pdf; goods-receipt-note.pdf"
    if code == "PROFILE-CUT" and status in {"Completed", "In Progress"}:
        return "approved-cutting-plan.dwg"
    if code == "WELDING" and status == "Delayed":
        return "weld-recovery-plan.pdf"
    if code == "PACKING" and status == "Completed":
        return "dispatch-inspection-report.pdf"
    return ""


def project_rows():
    return [[project.get(header, "") for header in PROJECT_HEADERS] for project in PROJECTS]


def stage_rows():
    rows = []
    for project in PROJECTS:
        planned_start = project["start_date"]
        for sequence, (code, name, duration, owner) in enumerate(WORKFLOW, start=1):
            planned_completion = planned_start + timedelta(days=duration - 1)
            progress = project["stage_progress"][sequence - 1]
            delayed = project["delayed_stage"] == sequence
            status = stage_status(progress, delayed)
            actual_start = planned_start if status != "Not Started" else ""
            actual_completion = planned_completion if status == "Completed" else ""
            rows.append(
                [
                    project["project_number"],
                    code,
                    name,
                    sequence,
                    status,
                    progress,
                    planned_start,
                    actual_start,
                    planned_completion,
                    actual_completion,
                    owner,
                    4 if delayed else 0,
                    stage_note(name, status),
                    attachment_refs(code, status),
                ]
            )
            planned_start = planned_completion + timedelta(days=1)
    return rows


def write_workbook(path, sheet_name, headers, rows, table_name):
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = sheet_name
    worksheet.append(headers)
    for row in rows:
        worksheet.append(row)

    header_fill = PatternFill("solid", fgColor="416F57")
    for cell in worksheet[1]:
        cell.fill = header_fill
        cell.font = Font(bold=True, color="FFFFFF")
        cell.alignment = Alignment(vertical="center", wrap_text=True)
    worksheet.freeze_panes = "A2"
    worksheet.auto_filter.ref = worksheet.dimensions
    table = Table(displayName=table_name, ref=worksheet.dimensions)
    table.tableStyleInfo = TableStyleInfo(
        name="TableStyleMedium4",
        showFirstColumn=False,
        showLastColumn=False,
        showRowStripes=True,
        showColumnStripes=False,
    )
    worksheet.add_table(table)
    for column in worksheet.columns:
        width = min(max(len(str(cell.value or "")) for cell in column) + 3, 42)
        worksheet.column_dimensions[column[0].column_letter].width = max(width, 12)
    for row in worksheet.iter_rows(min_row=2):
        for cell in row:
            if isinstance(cell.value, date):
                cell.number_format = "yyyy-mm-dd"
        if sheet_name == "Project Master":
            row[8].number_format = "#,##0"
    workbook.save(path)
    workbook.close()


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    write_workbook(
        OUTPUT_DIR / "project_master_mock.xlsx",
        "Project Master",
        PROJECT_HEADERS,
        project_rows(),
        "ProjectMasterMock",
    )
    write_workbook(
        OUTPUT_DIR / "project_stages_mock.xlsx",
        "Project Stages",
        STAGE_HEADERS,
        stage_rows(),
        "ProjectStagesMock",
    )
    print("Created project_master_mock.xlsx and project_stages_mock.xlsx")


if __name__ == "__main__":
    main()
