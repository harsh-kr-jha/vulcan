"""Generate a deterministic, import-ready Musroom sample pack."""

import csv
import hashlib
import json
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent
END_DATE = date(2026, 8, 5)
START_DATE = END_DATE - timedelta(days=6)


def write_csv(filename, rows):
    path = ROOT / filename
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]), lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    return {
        "file": filename,
        "rows": len(rows),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
    }


def operational_rows():
    rooms = ["Growing Room 1", "Growing Room 2", "Growing Room 3", "Growing Room 4"]
    harvest = []
    quality = []
    observations = []
    downtime = []
    reasons = ["Cap bruising", "Open veil", "Green mould contamination", "Undersize caps"]
    for day_offset in range(7):
        current = START_DATE + timedelta(days=day_offset)
        for room_index, room in enumerate(rooms, start=1):
            planned = 315 + room_index * 4
            actual = 292 + day_offset * 4 + room_index * 5
            rejected = 5 + (7 if room_index == 3 and day_offset >= 5 else room_index)
            grade_b = 12 + room_index
            good = actual - rejected - grade_b
            harvest.append(
                {
                    "date": current.isoformat(),
                    "line": "Growing Wing A",
                    "machine": room,
                    "sku": "Button Mushroom Grade A",
                    "shift": "Morning Harvest",
                    "order_id": f"MUS-HARV-{current:%m%d}",
                    "planned_quantity": planned,
                    "actual_quantity": actual,
                    "good_quantity": good,
                    "rejected_quantity": rejected,
                    "reworked_quantity": grade_b,
                    "batch_id": f"MUS-2607-R{room_index}",
                    "flush_number": 2 if day_offset < 4 else 3,
                    "substrate_dry_kg": 2400 + room_index * 50,
                    "growing_area_m2": 112,
                    "water_litres": 235 + room_index * 10,
                    "crop_age_days": 29 + day_offset,
                    "planned_minutes": 480,
                    "downtime_minutes": 74 if room_index == 3 and current == END_DATE else 8,
                    "ideal_cycle_minutes": 1.4,
                }
            )
            quality.append(
                {
                    "date": current.isoformat(),
                    "line": "Growing Wing A",
                    "machine": room,
                    "sku": "Button Mushroom Grade A",
                    "shift": "Morning Harvest",
                    "inspected_quantity": actual,
                    "rejected_quantity": rejected,
                    "reworked_quantity": grade_b,
                    "defect_reason": reasons[room_index - 1],
                }
            )
            humidity = 88 + room_index * 0.5
            co2 = 880 + room_index * 45
            status = "running"
            if room_index == 3 and current == END_DATE:
                humidity = 80.5
                co2 = 1620
                status = "warning"
            observations.append(
                {
                    "date": current.isoformat(),
                    "line": "Growing Wing A",
                    "process": "CROP",
                    "machine": f"GR-{room_index:02}",
                    "shift": "Day Crop Care",
                    "status": status,
                    "input_quantity": actual * 1.04,
                    "output_quantity": actual,
                    "rejected_quantity": rejected,
                    "run_minutes": 1366 if status == "warning" else 1432,
                    "cycle_time_minutes": 30240,
                    "temperature_c": round(17.4 + room_index * 0.2, 1),
                    "humidity_pct": humidity,
                    "co2_ppm": co2,
                    "substrate_moisture_pct": 68.5,
                    "water_litres": 235 + room_index * 10,
                    "treatment": "Lime + approved crop-care spray" if day_offset in {1, 5} else "",
                    "treatment_quantity": 30 if day_offset in {1, 5} else 0,
                    "temperature_min_c": 16,
                    "temperature_max_c": 19,
                    "humidity_min_pct": 85,
                    "humidity_max_pct": 92,
                    "co2_max_ppm": 1200,
                    "pressure_bar": "",
                    "energy_kwh": 44 + room_index * 8,
                    "downtime_minutes": 74 if status == "warning" else 8,
                    "operator": "Musroom Crop Team",
                    "batch_id": f"MUS-2607-R{room_index}",
                }
            )
        downtime.extend(
            [
                {
                    "date": current.isoformat(),
                    "line": "Growing Wing A",
                    "machine": "Growing Room 3",
                    "shift": "Day Crop Care",
                    "reason": "HVAC temperature deviation",
                    "minutes": 74 if current == END_DATE else 18,
                    "occurrences": 2 if current == END_DATE else 1,
                },
                {
                    "date": current.isoformat(),
                    "line": "Growing Wing A",
                    "machine": "Growing Room 2",
                    "shift": "Day Crop Care",
                    "reason": "Fogger pressure loss",
                    "minutes": 12,
                    "occurrences": 1,
                },
            ]
        )
    return observations, harvest, downtime, quality


def inventory_rows():
    specs = [
        ("Wheat straw", "Haryana Straw Collective", "kg", 24000, 5200, 18000, "on_time"),
        ("Chicken manure", "North India Poultry Inputs", "kg", 9800, 3100, 9300, "on_time"),
        ("Gypsum", "North India Poultry Inputs", "kg", 820, 260, 780, "on_time"),
        ("Urea", "North India Poultry Inputs", "kg", 210, 95, 285, "delayed"),
        ("Wheat bran", "Haryana Straw Collective", "kg", 580, 220, 660, "delayed"),
        ("Mushroom spawn", "Mycelium Genetics Lab", "kg", 760, 310, 930, "partial"),
        ("Cocopeat casing", "Green Casing Materials", "kg", 5200, 1850, 5550, "on_time"),
        ("Formalin", "Green Casing Materials", "litre", 340, 72, 216, "on_time"),
        ("Lime", "Green Casing Materials", "kg", 430, 160, 480, "on_time"),
        ("Packing punnets", "FreshPack Solutions", "pieces", 3600, 1800, 5400, "delayed"),
    ]
    return [
        {
            "date": END_DATE.isoformat(),
            "material": material,
            "supplier": supplier,
            "unit": unit,
            "available_quantity": available,
            "daily_consumption": consumption,
            "safety_stock": safety,
            "expected_receipt_date": (END_DATE + timedelta(days=2)).isoformat(),
            "required_date": (END_DATE + timedelta(days=1)).isoformat(),
            "receipt_status": status,
        }
        for material, supplier, unit, available, consumption, safety, status in specs
    ]


def supplier_rows():
    profiles = [
        ("Haryana Straw Collective", "Wheat straw", 30000, 0, 0.99, 0.99, "yes"),
        ("North India Poultry Inputs", "Chicken manure", 18000, 2, 0.96, 0.98, "yes"),
        ("Mycelium Genetics Lab", "Mushroom spawn", 2400, 3, 0.94, 0.995, "yes"),
        ("Green Casing Materials", "Cocopeat casing", 8000, 4, 0.91, 0.97, "no"),
        ("FreshPack Solutions", "Packing punnets", 15000, 6, 0.84, 0.95, "no"),
    ]
    rows = []
    for index, (
        supplier,
        material,
        ordered,
        delay,
        receipt_rate,
        acceptance_rate,
        terms,
    ) in enumerate(profiles, start=1):
        actual = END_DATE - timedelta(days=index - 1)
        promised = actual - timedelta(days=delay)
        received = round(ordered * receipt_rate)
        rows.append(
            {
                "supplier": supplier,
                "material": material,
                "purchase_order": f"MUS-PO-{index:03}",
                "order_date": (promised - timedelta(days=10)).isoformat(),
                "promised_date": promised.isoformat(),
                "actual_delivery_date": actual.isoformat(),
                "ordered_quantity": ordered,
                "received_quantity": received,
                "accepted_quantity": round(received * acceptance_rate),
                "terms_met": terms,
            }
        )
    return rows


def crop_cycle_rows():
    cycles = []
    stages = []
    names = [
        "Compost Preparation",
        "Pasteurisation & Conditioning",
        "Spawning",
        "Spawn Run",
        "Casing",
        "Pinning",
        "Cropping & Harvest",
        "Packing & Cold Room",
    ]
    for batch_index in range(1, 5):
        batch_id = f"MUS-2607-R{batch_index}"
        start = END_DATE - timedelta(days=48 - batch_index)
        delayed = batch_index == 3
        cycles.append(
            {
                "project_number": batch_id,
                "customer": "NCR Fresh Programme",
                "project_name": f"Button mushroom cycle · Growing Room {batch_index}",
                "po_number": f"MUS-PROG-{batch_index:02}",
                "category": "Button mushroom",
                "quantity": 3600,
                "uom": "kg",
                "factory_unit": "Growing Wing A",
                "order_value": 504000,
                "po_received_date": (start - timedelta(days=7)).isoformat(),
                "start_date": start.isoformat(),
                "customer_due_date": (END_DATE + timedelta(days=2 + batch_index)).isoformat(),
                "commitment_date": (END_DATE + timedelta(days=5 + batch_index)).isoformat(),
                "dispatch_date": "",
                "priority": "High" if delayed else "Medium",
                "status": "Delayed" if delayed else "In Progress",
                "progress": 74 if delayed else 82,
                "assigned_team": "Asha Verma|Crop lead; Ravi Malik|Room operations",
            }
        )
        for sequence, name in enumerate(names, start=1):
            stage_start = start + timedelta(days=(sequence - 1) * 6)
            completed = sequence <= 6
            stage_delayed = delayed and sequence == 7
            stages.append(
                {
                    "project_number": batch_id,
                    "stage_code": f"STAGE-{sequence:02}",
                    "stage_name": name,
                    "sequence": sequence,
                    "stage_status": "Completed"
                    if completed
                    else "Delayed"
                    if stage_delayed
                    else "In Progress",
                    "progress": 100 if completed else 55 if stage_delayed else 68,
                    "planned_start": stage_start.isoformat(),
                    "actual_start": stage_start.isoformat(),
                    "planned_completion": (stage_start + timedelta(days=5)).isoformat(),
                    "actual_completion": (stage_start + timedelta(days=5)).isoformat()
                    if completed
                    else "",
                    "assigned_to": "Asha Verma" if sequence < 7 else "Ravi Malik",
                    "delay_days": 2 if stage_delayed else 0,
                    "notes": "Room climate and hygiene records verified"
                    if completed
                    else "Active crop stage",
                    "attachments": f"{batch_id.lower()}-stage-{sequence:02}.pdf",
                }
            )
    return cycles, stages


def reference_rows():
    return [
        {
            "entity_type": "factory",
            "code": "MUSROOM-01",
            "name": "Musroom",
            "parent_code": "",
            "uom": "",
            "notes": "Synthetic showcase farm",
        },
        {
            "entity_type": "line",
            "code": "WING-A",
            "name": "Growing Wing A",
            "parent_code": "MUSROOM-01",
            "uom": "",
            "notes": "Four climate-controlled rooms",
        },
        *[
            {
                "entity_type": "room",
                "code": f"GR-{index:02}",
                "name": f"Growing Room {index}",
                "parent_code": "WING-A",
                "uom": "kg",
                "notes": "Cropping room",
            }
            for index in range(1, 5)
        ],
        {
            "entity_type": "process",
            "code": "CROP",
            "name": "Cropping & Harvest",
            "parent_code": "WING-A",
            "uom": "kg",
            "notes": "Climate, irrigation and harvest",
        },
        {
            "entity_type": "sku",
            "code": "MUSH-BUTTON-A",
            "name": "Button Mushroom Grade A",
            "parent_code": "",
            "uom": "kg",
            "notes": "Saleable grade",
        },
    ]


def main():
    observations, harvest, downtime, quality = operational_rows()
    cycles, stages = crop_cycle_rows()
    files = [
        write_csv("room_observations.csv", observations),
        write_csv("harvest.csv", harvest),
        write_csv("room_downtime.csv", downtime),
        write_csv("crop_quality.csv", quality),
        write_csv("inventory.csv", inventory_rows()),
        write_csv("supplier_receipts.csv", supplier_rows()),
        write_csv(
            "customer_orders.csv",
            [
                {
                    "order_id": "MUS-ORDER-NCR-001",
                    "sku": "Button Mushroom Grade A",
                    "line": "Growing Wing A",
                    "required_quantity": 3600,
                    "produced_quantity": 2740,
                    "due_date": "2026-08-06",
                    "priority": "critical",
                    "status": "open",
                },
                {
                    "order_id": "MUS-ORDER-HORECA-002",
                    "sku": "Button Mushroom Grade A",
                    "line": "Growing Wing A",
                    "required_quantity": 2400,
                    "produced_quantity": 1960,
                    "due_date": "2026-08-08",
                    "priority": "high",
                    "status": "open",
                },
            ],
        ),
        write_csv("crop_cycles.csv", cycles),
        write_csv("crop_stages.csv", stages),
        write_csv("factory_master_reference.csv", reference_rows()),
    ]
    manifest = {
        "dataset": "Musroom synthetic cultivation pack",
        "synthetic": True,
        "period": {"from": START_DATE.isoformat(), "to": END_DATE.isoformat()},
        "files": files,
        "importableRows": sum(item["rows"] for item in files[:-1]),
    }
    (ROOT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
