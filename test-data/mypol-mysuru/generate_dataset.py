#!/usr/bin/env python3
"""Generate deterministic, synthetic MYPOL-relevant data for Vulcan testing.

Nothing produced by this script is an actual MYPOL business record. Public information is
used only to choose relevant product families and a plausible rubber-manufacturing context.
"""

from __future__ import annotations

import csv
import hashlib
import json
import math
import random
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any

OUTPUT_DIR = Path(__file__).resolve().parent
START_DATE = date(2026, 6, 1)
END_DATE = date(2026, 7, 31)
NUMBER_OF_DAYS = (END_DATE - START_DATE).days + 1
SEED = 1981
RNG = random.Random(SEED)
SHIFTS = ("Shift A", "Shift B", "Shift C")
SHIFT_FACTORS = {"Shift A": 1.00, "Shift B": 0.98, "Shift C": 0.93}


@dataclass(frozen=True)
class Product:
    code: str
    name: str
    family: str
    nominal_plan: int
    quality_reason: str


@dataclass(frozen=True)
class Cell:
    line: str
    machine: str
    products: tuple[str, ...]
    plan_factor: float
    downtime_reasons: tuple[str, ...]


PRODUCTS = {
    product.code: product
    for product in (
        Product(
            "MYP-TUBE-250-18", "Butyl Tube 2.50-18 TR29", "Automotive Tubes", 900, "Valve base leak"
        ),
        Product(
            "MYP-TUBE-100-90-17",
            "Butyl Tube 100/90-17 TR4",
            "Automotive Tubes",
            820,
            "Splice thickness variation",
        ),
        Product(
            "MYP-TUBE-1100-20",
            "Butyl Tube 11.00-20 TR78A",
            "Automotive Tubes",
            285,
            "Air retention test failure",
        ),
        Product(
            "MYP-TUBE-600-16", "Butyl Tube 6.00-16 TR15", "Automotive Tubes", 340, "Valve base leak"
        ),
        Product(
            "MYP-CBAG-PCR",
            "PCR Tyre Curing Bag",
            "Tyre Industry Solutions",
            105,
            "Cure bladder surface blister",
        ),
        Product(
            "MYP-CBAG-TBR", "TBR Tyre Curing Bag", "Tyre Industry Solutions", 78, "Gauge variation"
        ),
        Product(
            "MYP-ENV-TBR",
            "TBR Retreading Envelope",
            "Tyre Industry Solutions",
            92,
            "Pin-hole / porosity",
        ),
        Product(
            "MYP-FLAP-1100-20",
            "Tyre Flap 11.00-20",
            "Tyre Industry Solutions",
            420,
            "Dimensional variation",
        ),
        Product(
            "MYP-RWD-2W",
            "Two-Wheeler Rear Wheel Damper",
            "Automotive Components / NVH",
            1_180,
            "Rubber-to-metal bond failure",
        ),
        Product(
            "MYP-NVH-MOUNT-45",
            "Industrial NVH Mount 45 mm",
            "Engineering Products",
            680,
            "Flash / trim defect",
        ),
    )
}


CELLS = (
    Cell(
        "Automotive Tube Line - 2W",
        "Tube Cure Press TC-01",
        ("MYP-TUBE-250-18", "MYP-TUBE-100-90-17"),
        1.00,
        (
            "Extruder die cleaning",
            "Valve applicator jam",
            "Splice joint adjustment",
            "Leak tester calibration",
        ),
    ),
    Cell(
        "Automotive Tube Line - 2W",
        "Tube Cure Press TC-02",
        ("MYP-TUBE-100-90-17", "MYP-TUBE-250-18"),
        0.96,
        (
            "Extruder temperature deviation",
            "Valve applicator jam",
            "Mould changeover overrun",
            "Material waiting - compound",
        ),
    ),
    Cell(
        "Automotive Tube Line - Heavy",
        "Tube Cure Press HC-01",
        ("MYP-TUBE-1100-20", "MYP-TUBE-600-16"),
        1.00,
        (
            "Steam pressure low",
            "Valve applicator jam",
            "Mould changeover overrun",
            "Leak tester calibration",
        ),
    ),
    Cell(
        "Automotive Tube Line - Heavy",
        "Tube Cure Press HC-02",
        ("MYP-TUBE-1100-20", "MYP-TUBE-600-16"),
        0.94,
        (
            "Steam control valve fault",
            "Mould changeover overrun",
            "Material waiting - compound",
            "Cure temperature deviation",
        ),
    ),
    Cell(
        "Tyre Industry Products Line",
        "Curing Products Press CP-01",
        ("MYP-CBAG-PCR", "MYP-ENV-TBR"),
        1.00,
        (
            "Mould cleaning",
            "Cure temperature deviation",
            "Reinforcement fabric waiting",
            "Mould changeover overrun",
        ),
    ),
    Cell(
        "Tyre Industry Products Line",
        "Curing Products Press CP-02",
        ("MYP-CBAG-TBR", "MYP-FLAP-1100-20"),
        0.93,
        (
            "Mould cleaning",
            "Steam pressure low",
            "Mould changeover overrun",
            "Preform weight adjustment",
        ),
    ),
    Cell(
        "Engineered Rubber Products Line",
        "Compression Moulding Press MP-01",
        ("MYP-RWD-2W", "MYP-NVH-MOUNT-45"),
        1.00,
        (
            "Insert loading delay",
            "Mould cleaning",
            "Hydraulic pressure fault",
            "Flash trimming station stop",
        ),
    ),
    Cell(
        "Engineered Rubber Products Line",
        "Compression Moulding Press MP-02",
        ("MYP-NVH-MOUNT-45", "MYP-RWD-2W"),
        0.95,
        (
            "Bonding agent waiting",
            "Mould temperature deviation",
            "Hydraulic pressure fault",
            "Insert loading delay",
        ),
    ),
)


MATERIALS = (
    ("RM-IIR-A", "Butyl Rubber IIR Grade A", "kg", 1_450, 1.25, "Approved Polymer Supplier A"),
    ("RM-NR-RSS4", "Natural Rubber RSS-4", "kg", 780, 8.5, "Approved Rubber Supplier B"),
    ("RM-CB-N660", "Carbon Black N660", "kg", 690, 6.8, "Approved Carbon Supplier C"),
    ("RM-CB-N330", "Carbon Black N330", "kg", 410, 9.4, "Approved Carbon Supplier C"),
    ("RM-OIL-PARA", "Paraffinic Process Oil", "litre", 260, 11.5, "Approved Chemical Supplier D"),
    ("RM-ZNO", "Zinc Oxide Rubber Grade", "kg", 95, 12.2, "Approved Chemical Supplier D"),
    ("RM-SULPHUR", "Sulphur Rubber Grade", "kg", 82, 10.4, "Approved Chemical Supplier D"),
    ("RM-ACC-MBTS", "Accelerator MBTS / TMTD Blend", "kg", 44, 7.2, "Approved Chemical Supplier D"),
    (
        "RM-AOX-6PPD",
        "Antioxidant / Antiozonant 6PPD",
        "kg",
        58,
        9.8,
        "Approved Chemical Supplier D",
    ),
    ("PM-VALVE-TR29", "Valve Stem Assembly TR29", "piece", 2_850, 5.6, "Approved Valve Supplier E"),
    (
        "PM-VALVE-TR78A",
        "Valve Stem Assembly TR78A",
        "piece",
        1_180,
        1.70,
        "Approved Valve Supplier E",
    ),
    (
        "RM-NYLON-FAB",
        "Nylon Reinforcement Fabric",
        "metre",
        220,
        4.1,
        "Approved Textile Supplier F",
    ),
    (
        "PM-STEEL-INS",
        "Steel Insert - NVH Components",
        "piece",
        2_050,
        6.4,
        "Approved Insert Supplier G",
    ),
    ("RM-BOND-R2M", "Rubber-to-Metal Bonding Agent", "kg", 90, 3.1, "Approved Chemical Supplier D"),
    (
        "PK-CARTON-MIX",
        "Finished Goods Packaging Cartons",
        "piece",
        760,
        7.8,
        "Approved Packaging Supplier H",
    ),
)


def daterange(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def write_csv(
    filename: str,
    fieldnames: list[str],
    rows: list[dict[str, Any]],
    line_terminator: str = "\r\n",
) -> dict[str, Any]:
    path = OUTPUT_DIR / filename
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames, lineterminator=line_terminator)
        writer.writeheader()
        writer.writerows(rows)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    return {"file": filename, "rows": len(rows), "sha256": digest}


def calendar_factor(day: date) -> float:
    if day.weekday() == 6:
        return 0.68
    if day.weekday() == 5:
        return 0.86
    return 1.0


def create_production() -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    production: list[dict[str, Any]] = []
    downtime: list[dict[str, Any]] = []
    quality: list[dict[str, Any]] = []
    for day_index, day in enumerate(daterange(START_DATE, END_DATE)):
        for shift_index, shift in enumerate(SHIFTS):
            for cell_index, cell in enumerate(CELLS):
                product_code = cell.products[
                    (day_index + shift_index + cell_index) % len(cell.products)
                ]
                product = PRODUCTS[product_code]
                planned = round(
                    product.nominal_plan
                    * cell.plan_factor
                    * SHIFT_FACTORS[shift]
                    * calendar_factor(day)
                )

                base_downtime = RNG.randint(4, 27)
                special_heavy_loss = cell.machine == "Tube Cure Press HC-02" and day >= date(
                    2026, 7, 28
                )
                special_mould_loss = cell.machine == "Compression Moulding Press MP-02" and date(
                    2026, 7, 25
                ) <= day <= date(2026, 7, 29)
                if special_heavy_loss:
                    base_downtime += 72 + (day.day % 3) * 16 + shift_index * 7
                if special_mould_loss:
                    base_downtime += 28 + shift_index * 5
                if (day_index + cell_index * 3 + shift_index) % 31 == 0:
                    base_downtime += 35
                downtime_minutes = min(base_downtime, 175)
                run_minutes = 450 - downtime_minutes

                speed_efficiency = RNG.uniform(0.89, 0.985)
                if day >= date(2026, 7, 25):
                    speed_efficiency -= 0.025
                if special_heavy_loss:
                    speed_efficiency -= 0.07
                actual = min(
                    planned, max(0, round(planned * (run_minutes / 450) * speed_efficiency))
                )

                reject_rate = RNG.uniform(0.006, 0.017)
                rework_rate = RNG.uniform(0.003, 0.010)
                defect_reason = product.quality_reason
                if special_heavy_loss and product_code == "MYP-TUBE-1100-20":
                    reject_rate += 0.045
                    rework_rate += 0.012
                    defect_reason = "Valve base leak"
                if special_mould_loss:
                    reject_rate += 0.026
                    defect_reason = "Rubber-to-metal bond failure"
                rejected = min(round(actual * reject_rate), actual)
                reworked = min(round(actual * rework_rate), max(actual - rejected, 0))
                good = actual - rejected - reworked
                ideal_cycle = 450 / max(round(product.nominal_plan * cell.plan_factor), 1)

                order_id = f"MYP-{day:%y%m%d}-{cell_index + 1:02d}-{shift_index + 1}"
                production.append(
                    {
                        "date": day.isoformat(),
                        "line": cell.line,
                        "machine": cell.machine,
                        "sku": product.code,
                        "shift": shift,
                        "order_id": order_id,
                        "planned_quantity": planned,
                        "actual_quantity": actual,
                        "good_quantity": good,
                        "rejected_quantity": rejected,
                        "reworked_quantity": reworked,
                        "planned_minutes": 450,
                        "downtime_minutes": downtime_minutes,
                        "ideal_cycle_minutes": f"{ideal_cycle:.5f}",
                    }
                )

                if special_heavy_loss:
                    downtime_reason = "Steam control valve fault"
                elif special_mould_loss:
                    downtime_reason = "Bonding agent waiting"
                elif (day_index + cell_index + shift_index) % 11 == 0:
                    downtime_reason = "Mould changeover overrun"
                else:
                    downtime_reason = cell.downtime_reasons[
                        (day_index + shift_index) % len(cell.downtime_reasons)
                    ]
                downtime.append(
                    {
                        "date": day.isoformat(),
                        "line": cell.line,
                        "machine": cell.machine,
                        "shift": shift,
                        "reason": downtime_reason,
                        "minutes": downtime_minutes,
                        "occurrences": max(1, math.ceil(downtime_minutes / 24)),
                    }
                )
                quality.append(
                    {
                        "date": day.isoformat(),
                        "line": cell.line,
                        "machine": cell.machine,
                        "sku": product.code,
                        "shift": shift,
                        "inspected_quantity": actual,
                        "rejected_quantity": rejected,
                        "reworked_quantity": reworked,
                        "defect_reason": defect_reason,
                    }
                )
    return production, downtime, quality


def create_inventory() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for day in daterange(START_DATE, END_DATE):
        days_to_end = (END_DATE - day).days
        for material_index, (_, material, unit, consumption, final_cover, supplier) in enumerate(
            MATERIALS
        ):
            replenishment_wave = ((days_to_end + material_index * 3) % 15) * 0.72
            cover = final_cover + replenishment_wave
            available = round(consumption * cover)
            if material == "Butyl Rubber IIR Grade A" and day >= date(2026, 7, 27):
                cover = max(1.25, 4.7 - (day - date(2026, 7, 27)).days * 0.86)
                available = round(consumption * cover)
            if material == "Valve Stem Assembly TR78A" and day >= date(2026, 7, 28):
                cover = max(1.70, 4.6 - (day - date(2026, 7, 28)).days * 0.96)
                available = round(consumption * cover)

            expected = day + timedelta(days=RNG.randint(2, 6))
            required = day + timedelta(days=3)
            delayed = day >= date(2026, 7, 29) and material in {
                "Butyl Rubber IIR Grade A",
                "Valve Stem Assembly TR78A",
                "Nylon Reinforcement Fabric",
            }
            if delayed:
                expected = day + timedelta(days=5)
            rows.append(
                {
                    "date": day.isoformat(),
                    "material": material,
                    "supplier": supplier,
                    "unit": unit,
                    "available_quantity": available,
                    "daily_consumption": consumption,
                    "safety_stock": round(consumption * 3),
                    "expected_receipt_date": expected.isoformat(),
                    "required_date": required.isoformat(),
                    "receipt_status": "delayed" if delayed else "on_time",
                }
            )
    return rows


def create_orders() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    product_codes = tuple(PRODUCTS)
    line_for_product = {
        product_code: next(cell.line for cell in CELLS if product_code in cell.products)
        for product_code in product_codes
    }
    sequence = 1
    for day_index, day in enumerate(daterange(START_DATE, date(2026, 7, 24))):
        for offset in range(2):
            product = PRODUCTS[product_codes[(day_index * 2 + offset) % len(product_codes)]]
            required = product.nominal_plan * RNG.randint(3, 7)
            rows.append(
                {
                    "order_id": f"MYP-ORD-{sequence:05d}",
                    "sku": product.code,
                    "line": line_for_product[product.code],
                    "required_quantity": required,
                    "produced_quantity": required,
                    "due_date": (day + timedelta(days=RNG.randint(3, 7))).isoformat(),
                    "priority": "high"
                    if sequence % 13 == 0
                    else "medium"
                    if sequence % 4 == 0
                    else "normal",
                    "status": "completed",
                }
            )
            sequence += 1

    current_orders = (
        ("MYP-ORD-AT-RISK-01", "MYP-TUBE-1100-20", 12_000, 6_900, date(2026, 8, 1), "high", "open"),
        ("MYP-ORD-AT-RISK-02", "MYP-CBAG-TBR", 1_400, 840, date(2026, 8, 1), "high", "open"),
        ("MYP-ORD-OPEN-03", "MYP-TUBE-250-18", 22_000, 18_600, date(2026, 8, 3), "high", "open"),
        ("MYP-ORD-OPEN-04", "MYP-RWD-2W", 30_000, 25_500, date(2026, 8, 4), "medium", "open"),
        ("MYP-ORD-OPEN-05", "MYP-ENV-TBR", 1_800, 1_280, date(2026, 8, 5), "medium", "open"),
        ("MYP-ORD-HOLD-06", "MYP-NVH-MOUNT-45", 8_500, 4_100, date(2026, 8, 6), "normal", "hold"),
        ("MYP-ORD-OPEN-07", "MYP-TUBE-600-16", 7_200, 5_900, date(2026, 8, 7), "normal", "open"),
        ("MYP-ORD-OPEN-08", "MYP-FLAP-1100-20", 9_500, 8_800, date(2026, 8, 8), "normal", "open"),
    )
    for order_id, product_code, required, produced, due, priority, status in current_orders:
        rows.append(
            {
                "order_id": order_id,
                "sku": product_code,
                "line": line_for_product[product_code],
                "required_quantity": required,
                "produced_quantity": produced,
                "due_date": due.isoformat(),
                "priority": priority,
                "status": status,
            }
        )
    return rows


def create_master_reference() -> list[dict[str, str]]:
    rows = [
        {
            "entity_type": "company",
            "code": "MYPOL",
            "name": "Mysore Polymers and Rubber Products Pvt. Ltd.",
            "parent_code": "",
            "uom": "",
            "notes": "Public company identity; test configuration only",
        },
        {
            "entity_type": "factory",
            "code": "MYP-MYS",
            "name": "MYPOL Mysuru Plant",
            "parent_code": "MYPOL",
            "uom": "",
            "notes": "Synthetic factory profile at the public Mysuru location",
        },
    ]
    line_codes: dict[str, str] = {}
    for index, line in enumerate(dict.fromkeys(cell.line for cell in CELLS), start=1):
        code = f"LINE-{index:02d}"
        line_codes[line] = code
        rows.append(
            {
                "entity_type": "line",
                "code": code,
                "name": line,
                "parent_code": "MYP-MYS",
                "uom": "piece",
                "notes": "Synthetic production line",
            }
        )
    for index, cell in enumerate(CELLS, start=1):
        rows.append(
            {
                "entity_type": "machine",
                "code": f"MC-{index:02d}",
                "name": cell.machine,
                "parent_code": line_codes[cell.line],
                "uom": "",
                "notes": "Plausible process asset; not an actual MYPOL asset ID",
            }
        )
    for product in PRODUCTS.values():
        rows.append(
            {
                "entity_type": "sku",
                "code": product.code,
                "name": product.name,
                "parent_code": "MYP-MYS",
                "uom": "piece",
                "notes": f"Synthetic SKU in public product family: {product.family}",
            }
        )
    for code, material, uom, _, _, supplier in MATERIALS:
        rows.append(
            {
                "entity_type": "material",
                "code": code,
                "name": material,
                "parent_code": "MYP-MYS",
                "uom": uom,
                "notes": "Plausible rubber-manufacturing input",
            }
        )
        supplier_code = "SUP-" + supplier.rsplit(" ", 1)[-1]
        if not any(
            row["entity_type"] == "supplier" and row["code"] == supplier_code for row in rows
        ):
            rows.append(
                {
                    "entity_type": "supplier",
                    "code": supplier_code,
                    "name": supplier,
                    "parent_code": "MYP-MYS",
                    "uom": "",
                    "notes": "Deliberately anonymized synthetic supplier",
                }
            )
    for index, shift in enumerate(SHIFTS, start=1):
        rows.append(
            {
                "entity_type": "shift",
                "code": f"SHIFT-{index}",
                "name": shift,
                "parent_code": "MYP-MYS",
                "uom": "",
                "notes": (
                    "06:00-14:00" if index == 1 else "14:00-22:00" if index == 2 else "22:00-06:00"
                ),
            }
        )
    reasons = sorted(
        {reason for cell in CELLS for reason in cell.downtime_reasons}
        | {"Steam control valve fault", "Bonding agent waiting"}
    )
    for index, reason in enumerate(reasons, start=1):
        rows.append(
            {
                "entity_type": "reason_code",
                "code": f"DT-{index:02d}",
                "name": reason,
                "parent_code": "MYP-MYS",
                "uom": "minute",
                "notes": "Synthetic downtime classification",
            }
        )
    return rows


def create_supplier_deliveries() -> list[dict[str, Any]]:
    """Create varied but repeatable supplier-delivery records for V2 scoring."""
    supplier_rng = random.Random(SEED + 77)
    profiles = (
        (
            "Mysuru Rubber Compounds",
            ("Butyl rubber compound", "Natural rubber RSS-4"),
            0.94,
            (0.97, 1.0),
            (0.98, 1.0),
            0.96,
        ),
        (
            "Karnataka Valve Works",
            ("Tube valve assembly", "Valve stem TR78A"),
            0.62,
            (0.88, 0.99),
            (0.95, 0.99),
            0.72,
        ),
        (
            "Southern Carbon Supply",
            ("Carbon black N330", "Carbon black N660"),
            0.86,
            (0.95, 1.0),
            (0.97, 1.0),
            0.90,
        ),
        (
            "Deccan Process Oils",
            ("Aromatic process oil", "Paraffinic process oil"),
            0.76,
            (0.92, 1.0),
            (0.96, 1.0),
            0.84,
        ),
        (
            "Precision Fabric Reinforcement",
            ("Nylon tyre cord", "Reinforcement fabric"),
            0.52,
            (0.84, 0.98),
            (0.92, 0.99),
            0.64,
        ),
    )
    rows = []
    for index in range(96):
        supplier, materials, on_time_rate, fill_range, quality_range, terms_rate = (
            supplier_rng.choice(profiles)
        )
        order_date = START_DATE + timedelta(days=supplier_rng.randint(0, NUMBER_OF_DAYS - 16))
        promised_date = order_date + timedelta(days=supplier_rng.randint(4, 9))
        delivery_offset = (
            supplier_rng.choice((-1, 0, 0))
            if supplier_rng.random() < on_time_rate
            else supplier_rng.randint(1, 5)
        )
        actual_date = promised_date + timedelta(days=delivery_offset)
        ordered = supplier_rng.randint(20, 240) * 50
        received = round(ordered * supplier_rng.uniform(*fill_range))
        accepted = round(received * supplier_rng.uniform(*quality_range))
        terms_met = supplier_rng.random() < terms_rate and delivery_offset <= 2
        rows.append(
            {
                "supplier": supplier,
                "material": supplier_rng.choice(materials),
                "purchase_order": f"MYP-PO-{index + 1:04d}",
                "order_date": order_date.isoformat(),
                "promised_date": promised_date.isoformat(),
                "actual_delivery_date": actual_date.isoformat(),
                "ordered_quantity": ordered,
                "received_quantity": received,
                "accepted_quantity": accepted,
                "terms_met": "yes" if terms_met else "no",
            }
        )
    return sorted(rows, key=lambda row: (row["actual_delivery_date"], row["supplier"]))


def validate(
    production: list[dict[str, Any]],
    downtime: list[dict[str, Any]],
    quality: list[dict[str, Any]],
    inventory: list[dict[str, Any]],
    orders: list[dict[str, Any]],
) -> None:
    assert len(production) == NUMBER_OF_DAYS * len(SHIFTS) * len(CELLS)
    assert len(quality) == len(production)
    assert len(downtime) == len(production)
    for row in production:
        assert (
            row["good_quantity"] + row["rejected_quantity"] + row["reworked_quantity"]
            == row["actual_quantity"]
        )
        assert 0 <= row["downtime_minutes"] < row["planned_minutes"]
        assert row["actual_quantity"] <= row["planned_quantity"]
    assert len({(row["date"], row["machine"], row["shift"]) for row in production}) == len(
        production
    )
    assert len(inventory) == NUMBER_OF_DAYS * len(MATERIALS)
    assert len({row["order_id"] for row in orders}) == len(orders)
    assert any(
        row["reason"] == "Steam control valve fault" and row["date"] == END_DATE.isoformat()
        for row in downtime
    )
    assert any(
        row["material"] == "Butyl Rubber IIR Grade A"
        and row["date"] == END_DATE.isoformat()
        and row["receipt_status"] == "delayed"
        for row in inventory
    )


def create_expected_results(
    production: list[dict[str, Any]],
    downtime: list[dict[str, Any]],
    quality: list[dict[str, Any]],
    inventory: list[dict[str, Any]],
    orders: list[dict[str, Any]],
) -> dict[str, Any]:
    from_date = date(2026, 7, 25).isoformat()
    to_date = END_DATE.isoformat()
    period_production = [row for row in production if from_date <= row["date"] <= to_date]
    period_downtime = [row for row in downtime if from_date <= row["date"] <= to_date]
    period_quality = [row for row in quality if from_date <= row["date"] <= to_date]

    planned = sum(row["planned_quantity"] for row in period_production)
    actual = sum(row["actual_quantity"] for row in period_production)
    good = sum(row["good_quantity"] for row in period_production)
    planned_minutes = sum(row["planned_minutes"] for row in period_production)
    downtime_minutes = sum(row["downtime_minutes"] for row in period_production)
    run_minutes = planned_minutes - downtime_minutes
    ideal_minutes = sum(
        float(row["ideal_cycle_minutes"]) * row["actual_quantity"] for row in period_production
    )
    availability = run_minutes / planned_minutes * 100
    performance = ideal_minutes / run_minutes * 100
    quality_rate = good / actual * 100
    oee = availability * performance * quality_rate / 10_000

    def ranked_total(rows: list[dict[str, Any]], key: str, measure: str) -> list[dict[str, Any]]:
        totals: dict[str, int] = {}
        for row in rows:
            totals[row[key]] = totals.get(row[key], 0) + row[measure]
        return [
            {key: name, measure: value}
            for name, value in sorted(totals.items(), key=lambda item: item[1], reverse=True)
        ]

    sku_totals: dict[str, dict[str, int]] = {}
    for row in period_quality:
        current = sku_totals.setdefault(row["sku"], {"inspected": 0, "rejected": 0})
        current["inspected"] += row["inspected_quantity"]
        current["rejected"] += row["rejected_quantity"]
    sku_rejection = sorted(
        (
            {
                "sku": sku,
                **totals,
                "rejection_rate": round(totals["rejected"] / totals["inspected"] * 100, 2),
            }
            for sku, totals in sku_totals.items()
        ),
        key=lambda item: item["rejection_rate"],
        reverse=True,
    )

    latest_inventory = [row for row in inventory if row["date"] == to_date]
    material_risks = sorted(
        (
            {
                "material": row["material"],
                "stock_cover_days": round(row["available_quantity"] / row["daily_consumption"], 2),
                "receipt_status": row["receipt_status"],
                "expected_receipt_date": row["expected_receipt_date"],
            }
            for row in latest_inventory
            if row["available_quantity"] / row["daily_consumption"] < 7
            or row["receipt_status"] == "delayed"
        ),
        key=lambda item: item["stock_cover_days"],
    )
    critical_due_date = (END_DATE + timedelta(days=1)).isoformat()
    critical_orders = [
        row["order_id"]
        for row in orders
        if row["status"] != "completed"
        and row["due_date"] <= critical_due_date
        and row["produced_quantity"] < row["required_quantity"]
    ]
    return {
        "filters": {
            "from": from_date,
            "to": to_date,
            "factory": "MYPOL Mysuru Plant",
            "line": "all",
            "machine": "all",
            "sku": "all",
            "shift": "all",
        },
        "production": {
            "records": len(period_production),
            "planned": planned,
            "actual": actual,
            "good": good,
            "plan_attainment_percent": round(actual / planned * 100, 2),
        },
        "oee": {
            "availability_percent": round(availability, 2),
            "performance_percent": round(performance, 2),
            "quality_percent": round(quality_rate, 2),
            "oee_percent": round(oee, 2),
            "formula": "availability × performance × quality",
        },
        "top_bottlenecks": ranked_total(period_downtime, "machine", "minutes")[:5],
        "top_downtime_reasons": ranked_total(period_downtime, "reason", "minutes")[:5],
        "top_defects": ranked_total(period_quality, "defect_reason", "rejected_quantity")[:5],
        "sku_rejection": sku_rejection,
        "material_risks": material_risks,
        "critical_orders": critical_orders,
    }


def main() -> None:
    production, downtime, quality = create_production()
    inventory = create_inventory()
    orders = create_orders()
    supplier_deliveries = create_supplier_deliveries()
    master_reference = create_master_reference()
    validate(production, downtime, quality, inventory, orders)
    expected_results = create_expected_results(production, downtime, quality, inventory, orders)

    files = [
        write_csv(
            "production.csv",
            [
                "date",
                "line",
                "machine",
                "sku",
                "shift",
                "order_id",
                "planned_quantity",
                "actual_quantity",
                "good_quantity",
                "rejected_quantity",
                "reworked_quantity",
                "planned_minutes",
                "downtime_minutes",
                "ideal_cycle_minutes",
            ],
            production,
        ),
        write_csv(
            "downtime.csv",
            ["date", "line", "machine", "shift", "reason", "minutes", "occurrences"],
            downtime,
        ),
        write_csv(
            "quality.csv",
            [
                "date",
                "line",
                "machine",
                "sku",
                "shift",
                "inspected_quantity",
                "rejected_quantity",
                "reworked_quantity",
                "defect_reason",
            ],
            quality,
        ),
        write_csv(
            "inventory.csv",
            [
                "date",
                "material",
                "supplier",
                "unit",
                "available_quantity",
                "daily_consumption",
                "safety_stock",
                "expected_receipt_date",
                "required_date",
                "receipt_status",
            ],
            inventory,
            line_terminator="\n",
        ),
        write_csv(
            "orders.csv",
            [
                "order_id",
                "sku",
                "line",
                "required_quantity",
                "produced_quantity",
                "due_date",
                "priority",
                "status",
            ],
            orders,
        ),
        write_csv(
            "suppliers.csv",
            [
                "supplier",
                "material",
                "purchase_order",
                "order_date",
                "promised_date",
                "actual_delivery_date",
                "ordered_quantity",
                "received_quantity",
                "accepted_quantity",
                "terms_met",
            ],
            supplier_deliveries,
            line_terminator="\n",
        ),
        write_csv(
            "factory_master_reference.csv",
            ["entity_type", "code", "name", "parent_code", "uom", "notes"],
            master_reference,
        ),
    ]
    manifest = {
        "dataset": "MYPOL Mysuru synthetic Vulcan test pack",
        "synthetic": True,
        "disclaimer": (
            "Generated test data; not actual MYPOL operational, customer, supplier, "
            "or financial records."
        ),
        "generator_seed": SEED,
        "period": {
            "from": START_DATE.isoformat(),
            "to": END_DATE.isoformat(),
            "days": NUMBER_OF_DAYS,
        },
        "factory": {
            "company": "Mysore Polymers and Rubber Products Pvt. Ltd.",
            "factory_name": "MYPOL Mysuru Plant",
            "code": "MYP-MYS",
            "timezone": "Asia/Kolkata",
            "currency": "INR",
        },
        "files": files,
        "expected_results_file": "expected_results.json",
        "totals": {
            "importable_rows": sum(item["rows"] for item in files[:6]),
            "reference_rows": files[6]["rows"],
        },
        "expected_signals_for_2026-07-25_to_2026-07-31": [
            "Tube Cure Press HC-02 should rank as the largest downtime bottleneck.",
            (
                "MYP-ORD-AT-RISK-01 and MYP-ORD-AT-RISK-02 should be critical because "
                "they remain open one day before due date."
            ),
            (
                "Butyl Rubber IIR Grade A and Valve Stem Assembly TR78A should show "
                "low stock cover with delayed receipts."
            ),
            "MYP-TUBE-1100-20 should show elevated rejection led by valve base leak.",
            (
                "Production should remain below plan and OEE below the configured target "
                "during the final week."
            ),
        ],
    }
    (OUTPUT_DIR / "expected_results.json").write_text(
        json.dumps(expected_results, indent=2) + "\n", encoding="utf-8"
    )
    (OUTPUT_DIR / "manifest.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(manifest["totals"], indent=2))


if __name__ == "__main__":
    main()
