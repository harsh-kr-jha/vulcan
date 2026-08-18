#!/usr/bin/env python3
"""Generate a deterministic, synthetic InfinexxGen-relevant Vulcan test pack.

The company identity, public locations, and broad product/process context are sourced.
Every customer, supplier, asset identity, project, schedule, quantity, value, KPI, defect,
and operational event emitted here is fictional test data.
"""

from __future__ import annotations

import csv
import hashlib
import json
import random
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any

OUTPUT_DIR = Path(__file__).resolve().parent
PROCESS_DIR = OUTPUT_DIR / "process"
START_DATE = date(2026, 6, 15)
END_DATE = date(2026, 8, 12)
FINAL_WEEK_START = date(2026, 8, 6)
SEED = 20260704
RNG = random.Random(SEED)
SHIFTS = ("Shift A", "Shift B")
SHIFT_FACTOR = {"Shift A": 1.0, "Shift B": 0.94}

LINE_1 = "Process Equipment & Vessel Fabrication Line"
LINE_2 = "Precision Piping & Modular Skid Line"


@dataclass(frozen=True)
class Product:
    code: str
    name: str
    line: str
    nominal_plan: int
    defect: str


@dataclass(frozen=True)
class Machine:
    code: str
    name: str
    power_kw: float
    model: str


@dataclass(frozen=True)
class Process:
    slug: str
    code: str
    name: str
    line_code: str
    line: str
    sequence: int
    input_unit: str
    output_unit: str
    target_cycle: float
    target_temperature: float | None
    target_pressure: float | None
    capacity_per_hour: float
    process_type: str
    description: str
    machines: tuple[Machine, ...]


PRODUCTS = (
    Product("IXG-HX-ST-1200", "Shell-and-Tube Heat Exchanger 1200", LINE_1, 14, "Tube-to-tubesheet joint seepage"),
    Product("IXG-FV-2000", "Flash Vessel 2000", LINE_1, 13, "Nozzle orientation deviation"),
    Product("IXG-CYC-3500", "SS304L Cyclone Separator 3500", LINE_1, 10, "Shell roundness deviation"),
    Product("IXG-SILO-25K", "SS304 Powder Silo 25 m3", LINE_1, 9, "Cone concentricity deviation"),
    Product("IXG-ATFD-0900", "Agitated Thin Film Dryer 900", LINE_1, 8, "Jacket hydro-test seepage"),
    Product("IXG-RCTR-3000", "Process Reactor 3000", LINE_1, 8, "Weld visual discontinuity"),
    Product("IXG-SKID-CIP", "Hygienic CIP Process Skid", LINE_2, 18, "Orbital weld discoloration"),
    Product("IXG-PIP-316L", "Orbital-Welded SS316L Piping Spool", LINE_2, 24, "Weld porosity indication"),
    Product("IXG-RR-0500", "Refrigerant Receiver 500", LINE_2, 17, "Pressure-test leak"),
    Product("IXG-OSEP-0800", "Oil Separator 800", LINE_2, 16, "Dimensional mismatch"),
    Product("IXG-DUCT-304", "SS304 Process Ducting Module", LINE_2, 22, "Surface-finish nonconformance"),
    Product("IXG-SKID-UTL", "Modular Utility Skid", LINE_2, 15, "Skid diagonal out of tolerance"),
)
PRODUCT_BY_CODE = {item.code: item for item in PRODUCTS}
PRODUCTS_BY_LINE = {
    line: tuple(item for item in PRODUCTS if item.line == line) for line in (LINE_1, LINE_2)
}

PROCESSES = (
    Process(
        "01-material-cutting", "L1-CUT", "Material Cutting & Profiling", "LINE-01", LINE_1, 1,
        "kg", "profile", 18, None, None, 3.4, "fabrication",
        "CNC profile cutting and traceable kit preparation for vessel components.",
        (Machine("PCM-01", "CNC Plasma Cutting Machine", 32, "Synthetic CNC plasma profile"),),
    ),
    Process(
        "02-plate-rolling", "L1-ROLL", "Plate Rolling & Forming", "LINE-01", LINE_1, 2,
        "profile", "formed shell", 42, None, 125, 1.5, "forming",
        "Plate rolling, cone forming and dimensional verification.",
        (Machine("ROLL-01", "Plate Rolling Machine", 28, "Synthetic hydraulic plate roller"),),
    ),
    Process(
        "03-machining-drilling", "L1-MACH", "Machining & Drilling", "LINE-01", LINE_1, 3,
        "component", "machined component", 28, None, None, 2.1, "machining",
        "Facing, boring, drilling and nozzle/flange preparation.",
        (
            Machine("LATHE-01", "Lathe Machine", 18.5, "Synthetic heavy-duty centre lathe"),
            Machine("DRILL-01", "Heavy Duty Drill Machine", 11, "Synthetic radial drill"),
        ),
    ),
    Process(
        "04-consumable-conditioning", "L1-COND", "Welding Consumable Conditioning", "LINE-01", LINE_1, 4,
        "kg electrode", "kg conditioned", 120, 250, None, 12, "welding-support",
        "Controlled electrode baking and holding before coded welding.",
        (Machine("EDO-01", "Electrode Drying Oven", 6, "Synthetic electrode drying oven"),),
    ),
    Process(
        "05-vessel-hydrotest", "L1-TEST", "Vessel Hydrostatic Testing", "LINE-01", LINE_1, 5,
        "assembly", "tested assembly", 180, None, 14, 0.33, "inspection-test",
        "Hydrostatic test, hold, pressure-drop check and release documentation.",
        (Machine("HTM-01", "Hydro Test Machine", 9, "Synthetic vessel hydro-test station"),),
    ),
    Process(
        "06-pipe-preparation", "L2-PREP", "Pipe Cutting & End Preparation", "LINE-02", LINE_2, 1,
        "metre", "prepared joint", 9, None, None, 6.5, "fabrication",
        "Square cutting, facing, deburring and weld-end preparation.",
        (Machine("PCS-01", "Precision Pipe Cutting Saw", 5.5, "Synthetic precision pipe saw"),),
    ),
    Process(
        "07-tube-expansion", "L2-EXP", "Tube Expansion & Jointing", "LINE-02", LINE_2, 2,
        "joint", "expanded joint", 7.5, None, None, 8, "assembly",
        "Controlled tube expansion with torque and dimensional checks.",
        (Machine("TEXP-01", "Tube Expander Machine", 3.2, "Synthetic electric tube expander"),),
    ),
    Process(
        "08-orbital-welding", "L2-OWLD", "Precision Orbital Welding", "LINE-02", LINE_2, 3,
        "prepared joint", "welded joint", 14, 95, 1.2, 4.2, "welding",
        "Programmed orbital welding with purge control and traceable weld records.",
        (Machine("OWM-01", "Orbital Welding Machine", 4.5, "Synthetic closed-head orbital welder"),),
    ),
    Process(
        "09-skid-assembly", "L2-SKID", "Skid Fit-up & Assembly", "LINE-02", LINE_2, 4,
        "component", "assembled module", 36, None, None, 1.7, "assembly",
        "Structural skid fit-up, equipment setting, piping alignment and dimensional checks.",
        (Machine("SKID-01", "Structural Skid Assembly Bay", 12, "Synthetic modular assembly bay"),),
    ),
    Process(
        "10-piping-pressure-test", "L2-TEST", "Piping Pressure & Leak Testing", "LINE-02", LINE_2, 5,
        "assembly", "tested assembly", 75, None, 10, 0.8, "inspection-test",
        "Pressure test, leak check, draining, drying and release documentation.",
        (Machine("HTR-02", "Portable Hydro Test Rig", 7.5, "Synthetic piping hydro-test rig"),),
    ),
    Process(
        "11-power-support", "L2-UTIL", "Backup Power Support", "LINE-02", LINE_2, 6,
        "operating hour", "supported hour", 60, 82, None, 1, "utility",
        "Backup electrical support for controlled fabrication and test activities.",
        (Machine("DG-63KVA", "DG-63KVA Generator", 50.4, "Synthetic 63 kVA diesel generator"),),
    ),
)

MATERIALS = (
    ("MAT-SA516-20", "SA516 Gr.70 Plate 20 mm", "kg", 920, 11.0, "Approved Plate Supplier A"),
    ("MAT-SS304-06", "SS304L Sheet 6 mm", "kg", 720, 10.5, "Approved Stainless Supplier B"),
    ("MAT-SS316-P", "SS316L Process Pipe", "metre", 86, 9.5, "Approved Pipe Supplier C"),
    ("MAT-SS316-T", "SS316L Heat Exchanger Tube", "metre", 180, 8.0, "Approved Tube Supplier D"),
    ("MAT-FLG-CS", "Forged Carbon Steel Flanges", "piece", 26, 10.0, "Approved Forging Supplier E"),
    ("MAT-FLG-316", "Forged SS316L Flanges", "piece", 18, 8.0, "Approved Forging Supplier E"),
    ("MAT-SEC-MS", "MS Structural Sections", "kg", 540, 12.0, "Approved Structural Supplier F"),
    ("MAT-ARGON", "High-Purity Argon", "cylinder", 3.5, 8.0, "Approved Industrial Gas Supplier G"),
    ("MAT-WIRE-316", "ER316L Welding Wire", "kg", 21, 9.0, "Approved Welding Supplier H"),
    ("MAT-ELECT-7018", "E7018 Welding Electrodes", "kg", 34, 10.0, "Approved Welding Supplier H"),
    ("MAT-GASKET", "Hydro-Test Gasket Set", "set", 7, 8.0, "Approved Sealing Supplier I"),
    ("MAT-VALVE-316", "SS316L Process Valves", "piece", 12, 9.0, "Approved Valve Supplier J"),
    ("MAT-PKL-PASS", "Pickling & Passivation Chemical", "litre", 38, 9.0, "Approved Chemical Supplier K"),
    ("MAT-PACK", "Export Packing Timber & Barrier Film", "set", 5, 10.0, "Approved Packaging Supplier L"),
)

PROJECTS = (
    {"project_number": "IXG-2026-039", "customer": "Edible Oil Processor A", "project_name": "Storage Tank Battery", "po_number": "SYN-PO-26039", "category": "Storage tanks", "sku": "IXG-FV-2000", "quantity": 4, "uom": "tanks", "line": LINE_1, "order_value": 4850000, "po_received_date": "2026-04-07", "start_date": "2026-04-18", "customer_due_date": "2026-06-26", "commitment_date": "2026-06-24", "dispatch_date": "2026-06-23", "priority": "Medium", "status": "Completed", "progress": 100},
    {"project_number": "IXG-2026-040", "customer": "Air Handling EPC B", "project_name": "SS304 Process Ducting Modules", "po_number": "SYN-PO-26040", "category": "Ducting", "sku": "IXG-DUCT-304", "quantity": 28, "uom": "modules", "line": LINE_2, "order_value": 3720000, "po_received_date": "2026-04-16", "start_date": "2026-04-29", "customer_due_date": "2026-07-10", "commitment_date": "2026-07-08", "dispatch_date": "2026-07-08", "priority": "Medium", "status": "Completed", "progress": 100},
    {"project_number": "IXG-2026-041", "customer": "Dairy Process Integrator C", "project_name": "Dairy Flash Cooler Skid", "po_number": "SYN-PO-26041", "category": "Flash vessel and skid", "sku": "IXG-FV-2000", "quantity": 1, "uom": "package", "line": LINE_1, "order_value": 2980000, "po_received_date": "2026-05-09", "start_date": "2026-05-20", "customer_due_date": "2026-08-18", "commitment_date": "2026-08-16", "dispatch_date": "", "priority": "High", "status": "In Progress", "progress": 82},
    {"project_number": "IXG-2026-042", "customer": "Food Ingredients EPC D", "project_name": "SS304 Powder Silo 25 m3", "po_number": "SYN-PO-26042", "category": "Silo", "sku": "IXG-SILO-25K", "quantity": 2, "uom": "silos", "line": LINE_1, "order_value": 6540000, "po_received_date": "2026-05-14", "start_date": "2026-05-28", "customer_due_date": "2026-08-10", "commitment_date": "2026-08-12", "dispatch_date": "", "priority": "Critical", "status": "Delayed", "progress": 68},
    {"project_number": "IXG-2026-043", "customer": "Industrial Drying Systems E", "project_name": "SS304L Cyclone Separator", "po_number": "SYN-PO-26043", "category": "Cyclone separator", "sku": "IXG-CYC-3500", "quantity": 1, "uom": "separator", "line": LINE_1, "order_value": 4120000, "po_received_date": "2026-05-23", "start_date": "2026-06-05", "customer_due_date": "2026-09-04", "commitment_date": "2026-09-01", "dispatch_date": "", "priority": "High", "status": "In Progress", "progress": 56},
    {"project_number": "IXG-2026-044", "customer": "Specialty Chemicals Plant F", "project_name": "Shell-and-Tube Heat Exchanger", "po_number": "SYN-PO-26044", "category": "Heat exchanger", "sku": "IXG-HX-ST-1200", "quantity": 2, "uom": "exchangers", "line": LINE_1, "order_value": 7360000, "po_received_date": "2026-05-29", "start_date": "2026-06-08", "customer_due_date": "2026-08-22", "commitment_date": "2026-08-20", "dispatch_date": "", "priority": "High", "status": "In Progress", "progress": 91},
    {"project_number": "IXG-2026-045", "customer": "Zero Liquid Discharge OEM G", "project_name": "ATFD Module with Structural Skid", "po_number": "SYN-PO-26045", "category": "ATFD", "sku": "IXG-ATFD-0900", "quantity": 1, "uom": "module", "line": LINE_1, "order_value": 12850000, "po_received_date": "2026-06-02", "start_date": "2026-06-17", "customer_due_date": "2026-09-10", "commitment_date": "2026-09-08", "dispatch_date": "", "priority": "Critical", "status": "Delayed", "progress": 39},
    {"project_number": "IXG-2026-046", "customer": "Fine Chemicals EPC H", "project_name": "Jacketed Process Reactor", "po_number": "SYN-PO-26046", "category": "Reactor", "sku": "IXG-RCTR-3000", "quantity": 1, "uom": "reactor", "line": LINE_1, "order_value": 8950000, "po_received_date": "2026-07-26", "start_date": "2026-08-18", "customer_due_date": "2026-11-12", "commitment_date": "2026-11-08", "dispatch_date": "", "priority": "Medium", "status": "Not Started", "progress": 0},
    {"project_number": "IXG-2026-047", "customer": "Beverage Equipment OEM I", "project_name": "Hygienic CIP Process Skid", "po_number": "SYN-PO-26047", "category": "Process skid", "sku": "IXG-SKID-CIP", "quantity": 1, "uom": "skid", "line": LINE_2, "order_value": 4680000, "po_received_date": "2026-05-18", "start_date": "2026-05-30", "customer_due_date": "2026-08-25", "commitment_date": "2026-08-22", "dispatch_date": "", "priority": "High", "status": "In Progress", "progress": 77},
    {"project_number": "IXG-2026-048", "customer": "Pharma Utility Integrator J", "project_name": "Orbital-Welded SS316L Piping Spools", "po_number": "SYN-PO-26048", "category": "High-purity piping", "sku": "IXG-PIP-316L", "quantity": 86, "uom": "spools", "line": LINE_2, "order_value": 5240000, "po_received_date": "2026-05-27", "start_date": "2026-06-07", "customer_due_date": "2026-08-09", "commitment_date": "2026-08-12", "dispatch_date": "", "priority": "Critical", "status": "Delayed", "progress": 63},
    {"project_number": "IXG-2026-049", "customer": "Industrial Refrigeration OEM K", "project_name": "Receiver and Oil Separator Package", "po_number": "SYN-PO-26049", "category": "Refrigeration equipment", "sku": "IXG-RR-0500", "quantity": 6, "uom": "vessels", "line": LINE_2, "order_value": 3460000, "po_received_date": "2026-06-05", "start_date": "2026-06-16", "customer_due_date": "2026-08-29", "commitment_date": "2026-08-27", "dispatch_date": "", "priority": "High", "status": "In Progress", "progress": 88},
    {"project_number": "IXG-2026-050", "customer": "Process Plant EPC L", "project_name": "Modular Chilled-Water Utility Skid", "po_number": "SYN-PO-26050", "category": "Utility skid", "sku": "IXG-SKID-UTL", "quantity": 2, "uom": "skids", "line": LINE_2, "order_value": 6120000, "po_received_date": "2026-06-18", "start_date": "2026-07-01", "customer_due_date": "2026-09-18", "commitment_date": "2026-09-15", "dispatch_date": "", "priority": "Medium", "status": "In Progress", "progress": 44},
    {"project_number": "IXG-2026-051", "customer": "Specialty Materials Producer M", "project_name": "Duplex Steel Piping and Skid Package", "po_number": "SYN-PO-26051", "category": "Piping and skid", "sku": "IXG-SKID-UTL", "quantity": 1, "uom": "package", "line": LINE_2, "order_value": 7820000, "po_received_date": "2026-07-30", "start_date": "2026-08-24", "customer_due_date": "2026-11-20", "commitment_date": "2026-11-16", "dispatch_date": "", "priority": "Medium", "status": "Not Started", "progress": 0},
)

LINE_PROJECTS = {
    line: tuple(project for project in PROJECTS if project["line"] == line and project["status"] != "Not Started")
    for line in (LINE_1, LINE_2)
}


def daterange(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def parse_day(value: str) -> date:
    return date.fromisoformat(value)


def write_csv(filename: str, fieldnames: list[str], rows: list[dict[str, Any]]) -> dict[str, Any]:
    path = OUTPUT_DIR / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    return file_record(path, len(rows))


def write_json(filename: str, payload: Any) -> dict[str, Any]:
    path = OUTPUT_DIR / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return file_record(path, None)


def file_record(path: Path, rows: int | None) -> dict[str, Any]:
    result = {
        "file": path.relative_to(OUTPUT_DIR).as_posix(),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }
    if rows is not None:
        result["rows"] = rows
    return result


def calendar_factor(day: date) -> float:
    return 0.72 if day.weekday() == 6 else 0.88 if day.weekday() == 5 else 1.0


def create_operations():
    production: list[dict[str, Any]] = []
    downtime: list[dict[str, Any]] = []
    quality: list[dict[str, Any]] = []
    line_machines = {
        LINE_1: [machine for process in PROCESSES if process.line == LINE_1 for machine in process.machines],
        LINE_2: [machine for process in PROCESSES if process.line == LINE_2 for machine in process.machines],
    }
    final_machine = {LINE_1: "Hydro Test Machine", LINE_2: "Portable Hydro Test Rig"}

    for day_index, day in enumerate(daterange(START_DATE, END_DATE)):
        for line_index, line in enumerate((LINE_1, LINE_2)):
            products = PRODUCTS_BY_LINE[line]
            projects = LINE_PROJECTS[line]
            for shift_index, shift in enumerate(SHIFTS):
                product = products[(day_index + shift_index + line_index) % len(products)]
                project = projects[(day_index // 5 + shift_index) % len(projects)]
                planned = max(
                    4,
                    round(product.nominal_plan * SHIFT_FACTOR[shift] * calendar_factor(day)),
                )
                base_loss = RNG.randint(8, 28)
                stress_roll = line == LINE_1 and day >= FINAL_WEEK_START
                stress_orbital = line == LINE_2 and day >= date(2026, 8, 7)
                if stress_roll:
                    base_loss += 38 + (day.day % 3) * 8 + shift_index * 4
                if stress_orbital:
                    base_loss += 48 + (day.day % 4) * 7 + shift_index * 5
                downtime_minutes = min(base_loss, 150)
                run_minutes = 450 - downtime_minutes
                speed = RNG.uniform(0.89, 0.98)
                if stress_roll or stress_orbital:
                    speed -= 0.055
                actual = min(planned, max(0, round(planned * run_minutes / 450 * speed)))
                reject_rate = RNG.uniform(0.012, 0.032)
                rework_rate = RNG.uniform(0.01, 0.035)
                defect = product.defect
                if stress_roll and product.line == LINE_1:
                    reject_rate += 0.055
                    rework_rate += 0.035
                    defect = "Shell roundness deviation"
                if stress_orbital and product.line == LINE_2:
                    reject_rate += 0.07
                    rework_rate += 0.04
                    defect = "Weld porosity indication"
                rejected = min(round(actual * reject_rate), actual)
                reworked = min(round(actual * rework_rate), max(actual - rejected, 0))
                good = actual - rejected - reworked
                ideal_cycle = round(450 / max(product.nominal_plan, 1), 3)

                production.append(
                    {
                        "date": day.isoformat(), "line": line, "machine": final_machine[line],
                        "sku": product.code, "shift": shift, "order_id": project["project_number"],
                        "planned_quantity": planned, "actual_quantity": actual,
                        "good_quantity": good, "rejected_quantity": rejected,
                        "reworked_quantity": reworked,
                        "batch_id": f"{project['project_number']}-{day:%m%d}-{shift[-1]}",
                        "planned_minutes": 450, "downtime_minutes": downtime_minutes,
                        "ideal_cycle_minutes": ideal_cycle,
                    }
                )

                if stress_roll:
                    loss_machine = next(item for item in line_machines[line] if item.code == "ROLL-01")
                    reason = "Rolling hydraulic pressure fluctuation"
                elif stress_orbital:
                    loss_machine = next(item for item in line_machines[line] if item.code == "OWM-01")
                    reason = "Orbital weld-head calibration"
                else:
                    loss_machine = line_machines[line][(day_index + shift_index * 2) % len(line_machines[line])]
                    reason_map = {
                        "PCM-01": "Plasma torch consumable change",
                        "ROLL-01": "Rolling setup and alignment",
                        "LATHE-01": "Tool insert replacement",
                        "DRILL-01": "Drill setup and clamping",
                        "EDO-01": "Electrode oven temperature recovery",
                        "HTM-01": "Hydro-test fixture changeover",
                        "PCS-01": "Pipe saw blade inspection",
                        "TEXP-01": "Tube expander torque calibration",
                        "OWM-01": "Shielding gas purge setup",
                        "SKID-01": "Skid alignment correction",
                        "HTR-02": "Pressure-test fixture changeover",
                        "DG-63KVA": "Generator preventive check",
                    }
                    reason = reason_map[loss_machine.code]
                event_minutes = max(4, round(downtime_minutes * RNG.uniform(0.58, 0.9)))
                downtime.append(
                    {
                        "date": day.isoformat(), "line": line, "machine": loss_machine.name,
                        "shift": shift, "reason": reason, "minutes": event_minutes,
                        "occurrences": 1 if event_minutes < 55 else 2,
                    }
                )
                if (day_index + shift_index + line_index) % 11 == 0:
                    downtime.append(
                        {
                            "date": day.isoformat(), "line": line,
                            "machine": final_machine[line], "shift": shift,
                            "reason": "Material traceability hold" if line == LINE_1 else "Isometric clarification hold",
                            "minutes": RNG.randint(8, 24), "occurrences": 1,
                        }
                    )

                quality.append(
                    {
                        "date": day.isoformat(), "line": line, "machine": final_machine[line],
                        "sku": product.code, "shift": shift, "inspected_quantity": actual,
                        "rejected_quantity": rejected, "reworked_quantity": reworked,
                        "defect_reason": defect,
                    }
                )
    return production, downtime, quality


def create_process_rows() -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = {}
    for process_index, process in enumerate(PROCESSES):
        rows: list[dict[str, Any]] = []
        for day_index, day in enumerate(daterange(START_DATE, END_DATE)):
            for shift_index, shift in enumerate(SHIFTS):
                for machine_index, machine in enumerate(process.machines):
                    planned_minutes = 440 if day.weekday() < 6 else 330
                    downtime = RNG.randint(2, 24)
                    stressed = (
                        process.code == "L1-ROLL" and day >= FINAL_WEEK_START
                    ) or (
                        process.code == "L2-OWLD" and day >= date(2026, 8, 7)
                    )
                    status = "Running"
                    if stressed:
                        downtime += 45 + (day_index + shift_index) % 26
                        status = "Attention"
                    elif day.weekday() == 6 and shift == "Shift B" and process.code not in {"L1-TEST", "L2-TEST"}:
                        downtime += 40
                        status = "Idle"
                    run_minutes = max(planned_minutes - downtime, 1)
                    nominal = process.capacity_per_hour * run_minutes / 60
                    input_quantity = max(1, round(nominal * RNG.uniform(0.88, 1.04), 2))
                    loss_rate = RNG.uniform(0.005, 0.025) + (0.055 if stressed else 0)
                    output_quantity = max(0, round(input_quantity * (1 - loss_rate), 2))
                    rejected = max(0, round(output_quantity * (RNG.uniform(0.0, 0.018) + (0.04 if stressed else 0)), 2))
                    temperature = ""
                    if process.target_temperature is not None:
                        temperature = round(process.target_temperature + RNG.uniform(-7, 7), 1)
                    pressure = ""
                    if process.target_pressure is not None:
                        pressure = round(process.target_pressure * RNG.uniform(0.94, 1.04), 2)
                    rows.append(
                        {
                            "date": day.isoformat(), "line": process.line, "process": process.code,
                            "machine": machine.name, "shift": shift, "status": status,
                            "input_quantity": input_quantity, "output_quantity": output_quantity,
                            "rejected_quantity": rejected, "run_minutes": run_minutes,
                            "cycle_time_minutes": round(process.target_cycle * RNG.uniform(0.94, 1.12 if stressed else 1.06), 2),
                            "temperature_c": temperature,
                            "temperature_min_c": round(process.target_temperature - 10, 1) if process.target_temperature is not None else "",
                            "temperature_max_c": round(process.target_temperature + 10, 1) if process.target_temperature is not None else "",
                            "pressure_bar": pressure,
                            "energy_kwh": round(machine.power_kw * run_minutes / 60 * RNG.uniform(0.52, 0.82), 2),
                            "downtime_minutes": downtime,
                            "operator": f"Synthetic Operator {1 + (day_index + shift_index + machine_index + process_index) % 8}",
                            "batch_id": f"PROC-{process.code}-{day:%y%m%d}-{shift[-1]}",
                        }
                    )
        result[f"process/{process.slug}.csv"] = rows
    return result


def create_inventory() -> list[dict[str, Any]]:
    rows = []
    risk_codes = {"MAT-SA516-20", "MAT-SS316-P", "MAT-ARGON", "MAT-FLG-316"}
    for day_index, day in enumerate(daterange(START_DATE, END_DATE)):
        for material_index, (code, name, unit, consumption, target_cover, supplier) in enumerate(MATERIALS):
            if code in risk_codes and day >= FINAL_WEEK_START:
                cover = max(1.15, 4.8 - (day - FINAL_WEEK_START).days * 0.55 + material_index * 0.05)
                status = "delayed"
                expected = END_DATE + timedelta(days=3 + material_index % 3)
                required = END_DATE + timedelta(days=1)
            else:
                cover = target_cover + 1.6 * ((day_index + material_index) % 5) / 4
                status = "received" if (day_index + material_index) % 13 == 0 else "scheduled"
                expected = day + timedelta(days=4 + material_index % 4)
                required = day + timedelta(days=6 + material_index % 4)
            daily_consumption = round(consumption * RNG.uniform(0.92, 1.08), 2)
            rows.append(
                {
                    "date": day.isoformat(), "material": name, "supplier": supplier, "unit": unit,
                    "available_quantity": round(daily_consumption * cover, 2),
                    "daily_consumption": daily_consumption,
                    "safety_stock": round(consumption * 3, 2),
                    "expected_receipt_date": expected.isoformat(),
                    "required_date": required.isoformat(), "receipt_status": status,
                }
            )
    return rows


def create_suppliers() -> list[dict[str, Any]]:
    rows = []
    for material_index, (_, material, unit, consumption, _, supplier) in enumerate(MATERIALS):
        for delivery_index in range(5):
            order_date = START_DATE + timedelta(days=material_index % 5 + delivery_index * 12)
            promised = order_date + timedelta(days=7 + material_index % 4)
            deliberately_late = (
                supplier in {"Approved Pipe Supplier C", "Approved Industrial Gas Supplier G", "Approved Forging Supplier E"}
                and delivery_index >= 3
            )
            actual = promised + timedelta(days=(3 + material_index % 3) if deliberately_late else (1 if (material_index + delivery_index) % 7 == 0 else 0))
            ordered = round(consumption * (10 + material_index % 4), 2)
            received = round(ordered * (RNG.uniform(0.91, 0.98) if deliberately_late else RNG.uniform(0.98, 1.0)), 2)
            accepted = round(received * RNG.uniform(0.965, 1.0), 2)
            rows.append(
                {
                    "supplier": supplier, "material": material,
                    "purchase_order": f"SYN-MAT-{material_index + 1:02d}-{delivery_index + 1:02d}",
                    "order_date": order_date.isoformat(), "promised_date": promised.isoformat(),
                    "actual_delivery_date": actual.isoformat(), "ordered_quantity": ordered,
                    "received_quantity": received, "accepted_quantity": accepted,
                    "terms_met": "No" if deliberately_late else "Yes",
                }
            )
    return rows


def create_orders() -> list[dict[str, Any]]:
    rows = []
    for index, project in enumerate(PROJECTS):
        required = max(40, int(project["quantity"] * 18 + 35 + index * 3))
        produced = round(required * project["progress"] / 100)
        rows.append(
            {
                "order_id": project["project_number"], "sku": project["sku"],
                "line": project["line"], "required_quantity": required,
                "produced_quantity": produced, "due_date": project["commitment_date"],
                "priority": project["priority"], "status": project["status"],
            }
        )
    for offset in range(6):
        product = PRODUCTS[offset % len(PRODUCTS)]
        due = END_DATE - timedelta(days=12 - offset * 2)
        rows.append(
            {
                "order_id": f"IXG-SPARES-2026-{offset + 1:02d}", "sku": product.code,
                "line": product.line, "required_quantity": 24 + offset * 6,
                "produced_quantity": 24 + offset * 6, "due_date": due.isoformat(),
                "priority": "Low", "status": "Completed",
            }
        )
    return rows


def create_utilities() -> list[dict[str, Any]]:
    rows = []
    for day_index, day in enumerate(daterange(START_DATE, END_DATE)):
        for shift_index, shift in enumerate(SHIFTS):
            load = calendar_factor(day) * SHIFT_FACTOR[shift]
            feedwater = round(1500 * load * RNG.uniform(0.94, 1.05), 2)
            inlet = round(29 + RNG.uniform(-2, 2), 1)
            tank = round(61 + min(day_index / 14, 4.5) + RNG.uniform(-1.5, 1.5), 1)
            steam = round(feedwater * RNG.uniform(0.86, 0.91), 2)
            condensate = round(steam * (0.39 + min(day_index / 900, 0.065) + RNG.uniform(-0.015, 0.015)), 2)
            flash = round(condensate * RNG.uniform(0.075, 0.105), 2)
            briquette = round(steam * (0.205 - min(day_index / 4500, 0.018)) * RNG.uniform(0.97, 1.03), 2)
            rows.append(
                {
                    "date": day.isoformat(), "shift": shift,
                    "boiler": "Fabrication Utility Boiler UB-01",
                    "feedwater_kg": feedwater, "feedwater_inlet_temperature_c": inlet,
                    "feedwater_tank_temperature_c": tank, "steam_generated_kg": steam,
                    "recovered_condensate_kg": condensate,
                    "flash_steam_recovered_kg": flash, "briquette_used_kg": briquette,
                    "briquette_gcv_kcal_per_kg": round(3820 + RNG.uniform(-70, 70), 0),
                    "boiler_efficiency_percent": round(73.5 + min(day_index / 22, 2.8) + RNG.uniform(-0.8, 0.8), 1),
                }
            )
    return rows


def create_project_rows():
    project_rows = []
    stage_rows = []
    stage_names = {
        LINE_1: (
            ("ENG", "Engineering & Drawing Release"), ("MAT", "Material Receipt & Traceability"),
            ("CUT", "Cutting & Edge Preparation"), ("FORM", "Rolling & Forming"),
            ("FIT", "Fit-up & Dimensional Control"), ("WELD", "Coded Welding"),
            ("NDT", "NDT & Weld Clearance"), ("TEST", "Hydrostatic / Leak Testing"),
            ("FIN", "Surface Finish & Final QA"), ("DSP", "Packing & Dispatch"),
        ),
        LINE_2: (
            ("ENG", "Engineering & Isometric Release"), ("MAT", "Material Receipt & PMI"),
            ("PREP", "Pipe Cutting & End Preparation"), ("OWLD", "Orbital / Coded Welding"),
            ("SKID", "Skid Fit-up & Assembly"), ("NDT", "Weld Inspection & NDT"),
            ("TEST", "Pressure / Leak Testing"), ("PASS", "Pickling, Passivation & Finish"),
            ("PACK", "Preservation & Packing"), ("DSP", "Final Release & Dispatch"),
        ),
    }
    owners = ("Synthetic Project Lead", "Synthetic Design Lead", "Synthetic Production Lead", "Synthetic QA Lead")
    for project_index, project in enumerate(PROJECTS):
        project_rows.append(
            {
                "project_number": project["project_number"], "customer": project["customer"],
                "project_name": project["project_name"], "po_number": project["po_number"],
                "category": project["category"], "quantity": project["quantity"], "uom": project["uom"],
                "factory_unit": project["line"], "order_value": project["order_value"],
                "po_received_date": project["po_received_date"], "start_date": project["start_date"],
                "customer_due_date": project["customer_due_date"],
                "commitment_date": project["commitment_date"], "dispatch_date": project["dispatch_date"],
                "priority": project["priority"], "status": project["status"], "progress": project["progress"],
                "assigned_team": "Synthetic Project Lead|Programme; Synthetic Production Lead|Fabrication; Synthetic QA Lead|Quality",
            }
        )
        start = parse_day(project["start_date"])
        finish = parse_day(project["commitment_date"])
        span = max((finish - start).days, 10)
        completed_stages = 10 if project["progress"] == 100 else int(project["progress"] // 10)
        partial_progress = 0 if project["progress"] in {0, 100} else int((project["progress"] - completed_stages * 10) * 10)
        for sequence, (stage_code, stage_name) in enumerate(stage_names[project["line"]], start=1):
            planned_start = start + timedelta(days=round((sequence - 1) * span / 10))
            planned_completion = start + timedelta(days=max(round(sequence * span / 10) - 1, 0))
            if sequence <= completed_stages:
                status, progress = "Completed", 100
                actual_start = planned_start + timedelta(days=(project_index + sequence) % 2)
                actual_completion = planned_completion + timedelta(days=1 if project["status"] == "Delayed" and sequence >= completed_stages - 1 else 0)
                delay_days = max((actual_completion - planned_completion).days, 0)
                note = f"Synthetic {stage_name.lower()} record completed and released."
            elif sequence == completed_stages + 1 and partial_progress:
                status = "Delayed" if project["status"] == "Delayed" else "In Progress"
                progress = partial_progress
                actual_start = planned_start + timedelta(days=1)
                actual_completion = None
                delay_days = 4 + project_index % 7 if status == "Delayed" else 0
                note = (
                    "Synthetic recovery action: expedite material/fixture readiness and add daily review."
                    if status == "Delayed" else "Synthetic work in progress; source documents under controlled review."
                )
            else:
                status, progress = "Not Started", 0
                actual_start = actual_completion = None
                delay_days = 0
                note = "Synthetic planned stage awaiting predecessor release."
            attachments = (
                f"{project['project_number']}-{stage_code.lower()}-traveller.pdf;"
                f"{project['project_number']}-{stage_code.lower()}-inspection.xlsx"
                if status != "Not Started" else ""
            )
            stage_rows.append(
                {
                    "project_number": project["project_number"], "stage_code": stage_code,
                    "stage_name": stage_name, "sequence": sequence, "stage_status": status,
                    "progress": progress, "planned_start": planned_start.isoformat(),
                    "actual_start": actual_start.isoformat() if actual_start else "",
                    "planned_completion": planned_completion.isoformat(),
                    "actual_completion": actual_completion.isoformat() if actual_completion else "",
                    "assigned_to": owners[(project_index + sequence) % len(owners)],
                    "delay_days": delay_days, "notes": note, "attachments": attachments,
                }
            )
    return project_rows, stage_rows


def factory_master_rows() -> list[dict[str, Any]]:
    rows = [
        {"entity_type": "company", "code": "INFINEXXGEN", "name": "InfinexxGen Engineering Solutions Pvt Ltd", "parent_code": "", "uom": "", "metadata_json": "{}", "notes": "Public company identity; all test operations are synthetic."},
        {"entity_type": "factory", "code": "IXG-CHK", "name": "InfinexxGen Chakan Works — Synthetic Twin", "parent_code": "INFINEXXGEN", "uom": "work package", "metadata_json": "{}", "notes": "Test-only factory profile using the public Chakan context."},
        {"entity_type": "line", "code": "LINE-01", "name": LINE_1, "parent_code": "IXG-CHK", "uom": "work package", "metadata_json": "{}", "notes": "Synthetic production line."},
        {"entity_type": "line", "code": "LINE-02", "name": LINE_2, "parent_code": "IXG-CHK", "uom": "work package", "metadata_json": "{}", "notes": "Synthetic production line."},
    ]
    for process in PROCESSES:
        metadata = {
            "sequence": process.sequence, "description": process.description,
            "processType": process.process_type, "inputUnit": process.input_unit,
            "outputUnit": process.output_unit, "targetCycleMinutes": process.target_cycle,
            "capacityPerHour": process.capacity_per_hour,
        }
        if process.target_temperature is not None:
            metadata["targetTemperatureC"] = process.target_temperature
        if process.target_pressure is not None:
            metadata["targetPressureBar"] = process.target_pressure
        rows.append(
            {"entity_type": "process", "code": process.code, "name": process.name,
             "parent_code": process.line_code, "uom": process.output_unit,
             "metadata_json": json.dumps(metadata, separators=(",", ":")),
             "notes": "Synthetic process master; create after its parent line."}
        )
        for machine in process.machines:
            machine_metadata = {
                "processCode": process.code, "manufacturer": "Synthetic reference",
                "model": machine.model, "powerKw": machine.power_kw,
                "capacityPerHour": process.capacity_per_hour,
            }
            rows.append(
                {"entity_type": "machine", "code": machine.code, "name": machine.name,
                 "parent_code": process.line_code, "uom": "",
                 "metadata_json": json.dumps(machine_metadata, separators=(",", ":")),
                 "notes": "Test-only asset identity; parent is the production line and processCode links the process."}
            )
    for product in PRODUCTS:
        rows.append(
            {"entity_type": "sku", "code": product.code, "name": product.name,
             "parent_code": "IXG-CHK", "uom": "work package", "metadata_json": "{}",
             "notes": "Synthetic SKU in a publicly relevant product family."}
        )
    seen_suppliers = set()
    for code, material, unit, _, _, supplier in MATERIALS:
        rows.append(
            {"entity_type": "material", "code": code, "name": material,
             "parent_code": "IXG-CHK", "uom": unit, "metadata_json": "{}",
             "notes": "Plausible fabrication input; synthetic stock and consumption."}
        )
        if supplier not in seen_suppliers:
            seen_suppliers.add(supplier)
            rows.append(
                {"entity_type": "supplier", "code": f"SUP-{len(seen_suppliers):02d}", "name": supplier,
                 "parent_code": "IXG-CHK", "uom": "", "metadata_json": "{}",
                 "notes": "Deliberately anonymized synthetic supplier."}
            )
    for index, shift in enumerate(SHIFTS, start=1):
        rows.append(
            {"entity_type": "shift", "code": f"SHIFT-{index}", "name": shift,
             "parent_code": "IXG-CHK", "uom": "", "metadata_json": "{}",
             "notes": "06:00–14:00" if index == 1 else "14:00–22:00"}
        )
    reasons = sorted(
        {
            "Rolling hydraulic pressure fluctuation", "Orbital weld-head calibration",
            "Material traceability hold", "Isometric clarification hold", "Plasma torch consumable change",
            "Rolling setup and alignment", "Tool insert replacement", "Drill setup and clamping",
            "Electrode oven temperature recovery", "Hydro-test fixture changeover", "Pipe saw blade inspection",
            "Tube expander torque calibration", "Shielding gas purge setup", "Skid alignment correction",
            "Pressure-test fixture changeover", "Generator preventive check",
        }
    )
    for index, reason in enumerate(reasons, start=1):
        rows.append(
            {"entity_type": "reason_code", "code": f"DT-{index:02d}", "name": reason,
             "parent_code": "IXG-CHK", "uom": "minute", "metadata_json": "{}",
             "notes": "Synthetic downtime classification."}
        )
    return rows


def factory_configuration() -> dict[str, Any]:
    return {
        "currency": "INR",
        "industry": "Industrial equipment fabrication",
        "subIndustry": "process-equipment-piping-and-modular-skids",
        "factoryDetails": {
            "factoryType": "Project-based process equipment, piping and modular skid fabrication",
            "facilityAreaM2": 2800,
            "ratedCapacityPerDay": 32,
            "productionUnit": "work packages",
            "operatingHoursPerDay": 16,
            "shiftsPerDay": 2,
            "powerCapacityKva": 500,
            "energyUnit": "kWh",
            "weightUnit": "kg",
            "temperatureUnit": "°C",
            "pressureUnit": "bar",
            "commissionedYear": 2024,
        },
        "targets": {
            "oee": 72, "availability": 88, "performance": 86, "quality": 97,
            "planAttainment": 90, "rejectionRate": 3, "supplierScore": 82,
            "stockCoverDays": 5, "downtimeMinutes": 55, "downtimeUnit": "minutes",
        },
        "customKpis": [
            {"id": "ixg-first-pass-output", "name": "First-pass output", "variableA": "production.good", "operation": "divide", "variableB": "production.actual", "scale": 100, "decimals": 1, "unit": "%", "pinnedToHome": True},
            {"id": "ixg-schedule-attainment", "name": "Schedule attainment", "variableA": "production.actual", "operation": "divide", "variableB": "production.planned", "scale": 100, "decimals": 1, "unit": "%", "pinnedToHome": True},
            {"id": "ixg-downtime-intensity", "name": "Downtime per work package", "variableA": "downtime.minutes", "operation": "divide", "variableB": "production.actual", "scale": 1, "decimals": 2, "unit": "min/pkg", "pinnedToHome": True},
            {"id": "ixg-rework-share", "name": "Rework share", "variableA": "quality.reworked", "operation": "divide", "variableB": "quality.inspected", "scale": 100, "decimals": 1, "unit": "%", "pinnedToHome": False},
        ],
        "showcase": {
            "synthetic": True,
            "source": "test-data/infinexxgen-chakan",
            "period": {"from": START_DATE.isoformat(), "to": END_DATE.isoformat()},
            "recommendedRange": {"from": FINAL_WEEK_START.isoformat(), "to": END_DATE.isoformat()},
            "disclaimer": "Test-only operational data. It does not describe actual InfinexxGen customers, projects, assets, suppliers, capacity, finances or performance.",
        },
    }


def metadata(process_files: dict[str, list[dict[str, Any]]]) -> dict[str, Any]:
    return {
        "packId": "infinexxgen-chakan-two-line-synthetic-v1",
        "schemaVersion": "vulcan-automotive-import-v1",
        "synthetic": True,
        "company": {
            "displayName": "InfinexxGen Engineering Solutions Pvt Ltd",
            "legalName": "InfinexxGen Engineering Solutions Private Limited",
            "publicContext": "Industrial equipment manufacturer in Chakan, Pune, founded in 2023; formerly New Pleiaad.",
            "publicLocations": [
                "Unit I — MIDC Chakan Phase II, Pune, Maharashtra 410501",
                "Unit II — MIDC Chakan Phase II, Pune, Maharashtra 410507",
            ],
        },
        "factory": {
            "name": "InfinexxGen Chakan Works — Synthetic Twin", "code": "IXG-CHK",
            "timezone": "Asia/Kolkata", "currency": "INR",
            "addressForTestSetup": "MIDC Chakan Phase II, Pune, Maharashtra",
            "configurationFile": "factory_configuration.json",
            "masterReferenceFile": "factory_master_reference.csv",
        },
        "period": {"from": START_DATE.isoformat(), "to": END_DATE.isoformat(), "days": (END_DATE - START_DATE).days + 1},
        "recommendedDemoRange": {"from": FINAL_WEEK_START.isoformat(), "to": END_DATE.isoformat()},
        "quantitySemantics": {
            "productionUnit": "work package",
            "definition": "A completed, traceable fabrication or inspection package—not a finished vessel count. This lets unlike project products share one operational KPI model without pretending that tonnes, welds and vessels are directly additive.",
            "projectQuantities": "Projects retain their own commercial units such as vessel, spool, skid or module.",
        },
        "lines": [
            {"code": "LINE-01", "name": LINE_1, "purpose": "Plate preparation, forming, machining, weld-consumable control and vessel testing."},
            {"code": "LINE-02", "name": LINE_2, "purpose": "Precision pipe preparation, tube expansion, orbital welding, skid assembly and pressure testing."},
        ],
        "processImports": [
            {"file": filename, "selectProcessCode": process.code, "selectProcessName": process.name}
            for process, filename in zip(PROCESSES, process_files, strict=True)
        ],
        "sourceBoundary": {
            "sourced": [
                "Company name, former name, 2023 founding, Chakan/Pune context and two public MIDC unit addresses.",
                "Broad product families: heat exchangers, vapour separators, flash vessels, silos, cyclone columns/separators, reactors, ATFDs, refrigerant receivers, storage tanks, structural skids, oil separators, tanks and piping.",
                "Public capability themes: orbital welding, precision pipe cutting, heavy plate/SS fabrication, modular skid assembly, cyclone separators, silos, ducting and radiographic-quality piping.",
            ],
            "synthetic": [
                "Every project/customer/order/PO, supplier identity, material transaction, machine identity and specification, factory capacity, schedule, quantity, financial value, performance result, delay, defect and utility reading.",
            ],
            "sourcesFile": "SOURCES.md",
        },
        "designedSignals": [
            "Plate Rolling Machine becomes the Line 1 bottleneck during the recommended week.",
            "Orbital Welding Machine becomes the Line 2 bottleneck, with weld-porosity quality loss.",
            "Four material families show low cover and delayed receipts.",
            "Two critical projects are delayed at their commitment date.",
            "Supplier delays, order risk, process attention, quality loss and production under-attainment are correlated for dashboard storytelling.",
        ],
    }


def expected_results(production, downtime, quality, inventory, orders, project_rows, process_rows):
    def in_final(row):
        return FINAL_WEEK_START.isoformat() <= row["date"] <= END_DATE.isoformat()

    prod = [row for row in production if in_final(row)]
    losses = [row for row in downtime if in_final(row)]
    inspections = [row for row in quality if in_final(row)]
    planned = sum(row["planned_quantity"] for row in prod)
    actual = sum(row["actual_quantity"] for row in prod)
    good = sum(row["good_quantity"] for row in prod)
    planned_minutes = sum(row["planned_minutes"] for row in prod)
    run_minutes = planned_minutes - sum(row["downtime_minutes"] for row in prod)
    ideal_minutes = sum(row["ideal_cycle_minutes"] * row["actual_quantity"] for row in prod)
    availability = run_minutes / planned_minutes * 100 if planned_minutes else 0
    performance = ideal_minutes / run_minutes * 100 if run_minutes else 0
    quality_rate = good / actual * 100 if actual else 0
    machine_loss: dict[str, float] = defaultdict(float)
    reason_loss: dict[str, float] = defaultdict(float)
    defect_loss: dict[str, float] = defaultdict(float)
    for row in losses:
        machine_loss[row["machine"]] += row["minutes"]
        reason_loss[row["reason"]] += row["minutes"]
    for row in inspections:
        defect_loss[row["defect_reason"]] += row["rejected_quantity"]
    latest_inventory = [row for row in inventory if row["date"] == END_DATE.isoformat()]
    risks = [
        {"material": row["material"], "stock_cover_days": round(row["available_quantity"] / row["daily_consumption"], 2), "receipt_status": row["receipt_status"]}
        for row in latest_inventory
        if row["receipt_status"] == "delayed" or row["available_quantity"] / row["daily_consumption"] < 7
    ]
    attention = []
    for filename, rows in process_rows.items():
        latest = [row for row in rows if row["date"] == END_DATE.isoformat()]
        if any(row["status"] in {"Attention", "Down"} for row in latest):
            attention.append(filename)
    return {
        "filters": {"from": FINAL_WEEK_START.isoformat(), "to": END_DATE.isoformat(), "factory": "InfinexxGen Chakan Works — Synthetic Twin", "line": "all", "machine": "all", "sku": "all", "shift": "all"},
        "production": {"records": len(prod), "planned_work_packages": planned, "actual_work_packages": actual, "good_work_packages": good, "plan_attainment_percent": round(actual / planned * 100, 2)},
        "oee": {"availability_percent": round(availability, 2), "performance_percent": round(performance, 2), "quality_percent": round(quality_rate, 2), "oee_percent": round(availability * performance * quality_rate / 10000, 2), "formula": "availability × performance × quality"},
        "top_bottlenecks": [{"machine": key, "minutes": value} for key, value in sorted(machine_loss.items(), key=lambda item: item[1], reverse=True)[:6]],
        "top_downtime_reasons": [{"reason": key, "minutes": value} for key, value in sorted(reason_loss.items(), key=lambda item: item[1], reverse=True)[:6]],
        "top_defects": [{"defect_reason": key, "rejected_quantity": value} for key, value in sorted(defect_loss.items(), key=lambda item: item[1], reverse=True)[:6]],
        "material_risks": sorted(risks, key=lambda item: item["stock_cover_days"]),
        "critical_orders": [row["order_id"] for row in orders if row["status"] != "Completed" and row["due_date"] <= END_DATE.isoformat() and row["produced_quantity"] < row["required_quantity"]],
        "delayed_projects": [row["project_number"] for row in project_rows if row["status"] == "Delayed"],
        "process_files_with_attention_on_final_day": attention,
    }


def main():
    PROCESS_DIR.mkdir(parents=True, exist_ok=True)
    production, downtime, quality = create_operations()
    process_rows = create_process_rows()
    inventory = create_inventory()
    suppliers = create_suppliers()
    orders = create_orders()
    utilities = create_utilities()
    project_rows, stage_rows = create_project_rows()
    masters = factory_master_rows()

    files = []
    files.append(write_csv("projects.csv", ["project_number", "customer", "project_name", "po_number", "category", "quantity", "uom", "factory_unit", "order_value", "po_received_date", "start_date", "customer_due_date", "commitment_date", "dispatch_date", "priority", "status", "progress", "assigned_team"], project_rows))
    files.append(write_csv("project_stages.csv", ["project_number", "stage_code", "stage_name", "sequence", "stage_status", "progress", "planned_start", "actual_start", "planned_completion", "actual_completion", "assigned_to", "delay_days", "notes", "attachments"], stage_rows))
    files.append(write_csv("production.csv", ["date", "line", "machine", "sku", "shift", "order_id", "planned_quantity", "actual_quantity", "good_quantity", "rejected_quantity", "reworked_quantity", "batch_id", "planned_minutes", "downtime_minutes", "ideal_cycle_minutes"], production))
    files.append(write_csv("downtime.csv", ["date", "line", "machine", "shift", "reason", "minutes", "occurrences"], downtime))
    files.append(write_csv("quality.csv", ["date", "line", "machine", "sku", "shift", "inspected_quantity", "rejected_quantity", "reworked_quantity", "defect_reason"], quality))
    files.append(write_csv("inventory.csv", ["date", "material", "supplier", "unit", "available_quantity", "daily_consumption", "safety_stock", "expected_receipt_date", "required_date", "receipt_status"], inventory))
    files.append(write_csv("orders.csv", ["order_id", "sku", "line", "required_quantity", "produced_quantity", "due_date", "priority", "status"], orders))
    files.append(write_csv("suppliers.csv", ["supplier", "material", "purchase_order", "order_date", "promised_date", "actual_delivery_date", "ordered_quantity", "received_quantity", "accepted_quantity", "terms_met"], suppliers))
    files.append(write_csv("utilities.csv", ["date", "shift", "boiler", "feedwater_kg", "feedwater_inlet_temperature_c", "feedwater_tank_temperature_c", "steam_generated_kg", "recovered_condensate_kg", "flash_steam_recovered_kg", "briquette_used_kg", "briquette_gcv_kcal_per_kg", "boiler_efficiency_percent"], utilities))
    files.append(write_csv("factory_master_reference.csv", ["entity_type", "code", "name", "parent_code", "uom", "metadata_json", "notes"], masters))
    process_fields = ["date", "line", "process", "machine", "shift", "status", "input_quantity", "output_quantity", "rejected_quantity", "run_minutes", "cycle_time_minutes", "temperature_c", "temperature_min_c", "temperature_max_c", "pressure_bar", "energy_kwh", "downtime_minutes", "operator", "batch_id"]
    for filename, rows in process_rows.items():
        files.append(write_csv(filename, process_fields, rows))

    configuration = factory_configuration()
    configuration_record = write_json("factory_configuration.json", configuration)
    metadata_payload = metadata(process_rows)
    metadata_record = write_json("metadata.json", metadata_payload)
    expected = expected_results(production, downtime, quality, inventory, orders, project_rows, process_rows)
    expected_record = write_json("expected_results.json", expected)

    importable_rows = sum(item.get("rows", 0) for item in files if item["file"] != "factory_master_reference.csv")
    manifest = {
        "dataset": "InfinexxGen Chakan two-line synthetic Vulcan test pack",
        "synthetic": True,
        "disclaimer": "Generated test data; not actual InfinexxGen operational, customer, supplier, asset, project or financial records.",
        "generator_seed": SEED,
        "period": metadata_payload["period"],
        "factory": {"company": "InfinexxGen Engineering Solutions Pvt Ltd", "factory_name": "InfinexxGen Chakan Works — Synthetic Twin", "code": "IXG-CHK", "timezone": "Asia/Kolkata", "currency": "INR"},
        "files": files + [configuration_record, metadata_record, expected_record],
        "totals": {"importable_rows": importable_rows, "reference_rows": len(masters), "process_files": len(process_rows)},
        "recommended_demo_range": metadata_payload["recommendedDemoRange"],
    }
    write_json("manifest.json", manifest)
    print(json.dumps(manifest["totals"], indent=2))


if __name__ == "__main__":
    main()
