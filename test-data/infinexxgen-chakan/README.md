# InfinexxGen Chakan two-line synthetic test pack

This is a deterministic, import-ready automotive-variant test pack for Vulcan. It models a
project-based industrial-equipment fabricator with two production lines and 11 process sheets.

## Important boundary

**All operational and commercial data is synthetic.** The customers, projects, suppliers,
machine IDs/specifications, factory capacity, schedules, prices, production results, defects,
downtime and utility readings are fictional test data. They must not be represented as actual
InfinexxGen records.

Public information was used only to keep the scenario relevant: InfinexxGen publicly identifies
itself as a 2023 Chakan/Pune industrial-equipment manufacturer (formerly New Pleiaad), publishes
two MIDC Chakan Phase II locations, lists process-equipment product families, and discusses
orbital welding, precision pipe cutting, heavy fabrication, skids, silos, cyclone separators,
ducting and piping. See [SOURCES.md](SOURCES.md).

## What is included

The pack covers **59 days, 15 June–12 August 2026**, with two shifts. It uses "work package" as
the common production unit: a completed traceable fabrication or inspection package, not a
finished-vessel count. Project rows retain commercial units such as vessels, spools and skids.

| File | Vulcan type / use | Rows |
|---|---|---:|
| `projects.csv` | Projects | 13 |
| `project_stages.csv` | Project stages (10 stages/project) | 130 |
| `production.csv` | Production plan, output, quality and OEE inputs | 236 |
| `downtime.csv` | Classified machine/shift losses | 257 |
| `quality.csv` | Inspection, rejection, rework and defect Pareto | 236 |
| `inventory.csv` | Daily material cover and receipt risk | 826 |
| `orders.csv` | Project and completed spares orders | 19 |
| `suppliers.csv` | Delivery, quantity, acceptance and terms performance | 70 |
| `utilities.csv` | Synthetic fabrication-utility boiler log | 118 |
| `process/*.csv` | One import sheet per configured process | 1,416 total |
| `factory_master_reference.csv` | Setup reference; not an operational upload | 83 |
| `factory_configuration.json` | JSON to paste into the Django Admin Factory `configuration` field | — |
| `metadata.json` | Pack semantics, source boundary, line model and process-file mapping | — |
| `expected_results.json` | Exact verification signals for the recommended week | — |
| `manifest.json` | Row counts and SHA-256 checksums | — |

Exact counts and checksums are in [manifest.json](manifest.json).

## Production model

1. **Process Equipment & Vessel Fabrication Line**
   - Material cutting and profiling
   - Plate rolling and forming
   - Lathe machining and heavy drilling
   - Welding-consumable conditioning
   - Vessel hydrostatic testing
2. **Precision Piping & Modular Skid Line**
   - Precision pipe cutting/end preparation
   - Tube expansion
   - Orbital welding
   - Structural-skid assembly
   - Piping pressure/leak testing
   - Backup power support

The reference master also includes the machinery shown in the supplied image: lathe, heavy-duty
drill, orbital welder, DG-63KVA, plasma cutter, hydro-test equipment, plate roller, electrode
drying oven and tube expander. Names and specifications are still test-only.

## Safe manual setup (no local integration is provided)

Create the company and factory in Django Admin:

- Company: `InfinexxGen Engineering Solutions Pvt Ltd`
- Factory name: `InfinexxGen Chakan Works — Synthetic Twin`
- Factory code: `IXG-CHK`
- Time zone: `Asia/Kolkata`
- Address: `MIDC Chakan Phase II, Pune, Maharashtra`

Open [factory_configuration.json](factory_configuration.json), copy the whole JSON object, and
paste it into that Factory's **configuration** field. The capacity, power and commissioned-year
values in it are synthetic scenario assumptions.

Next open **Factory setup**, keep this factory selected, and click **Import master CSV**. Choose
[factory_master_reference.csv](factory_master_reference.csv), review the complete validation
preview, and click **Apply 81 masters**. The import is atomic and idempotent: matching kind/code
pairs are updated or reactivated, new pairs are created, and masters omitted from the CSV are left
untouched. The contextual `company` and `factory` rows are shown but not written.

If masters must be entered manually instead, use the same file and create them in this order:

1. `line`
2. `process` (parent is its line; paste `metadata_json`)
3. `machine` (parent is its line; `metadata_json.processCode` connects it to the process)
4. `sku`, `material`, `supplier`, `shift`, `reason_code`

`company` and `factory` rows in the reference file are descriptive only. In Django Admin, the
Vulcan kinds are `lines`, `processes`, `machines`, `skus`, `materials`, `suppliers`, `shifts` and
`reasonCodes`.

## Import order

In **Data upload → Add factory data → Excel / CSV**, import and approve:

1. `projects.csv` as **Projects**
2. `project_stages.csv` as **Project stages** (the project references must already exist)
3. `production.csv` as **Production**
4. `downtime.csv` as **Downtime**
5. `quality.csv` as **Quality**
6. `inventory.csv` as **Inventory**
7. `orders.csv` as **Orders**
8. `suppliers.csv` as **Supplier deliveries**
9. `utilities.csv` as **Utilities**

For every file under `process/`, choose **Process**, then select the exact process shown in
`metadata.json.processImports`. Each file deliberately contains only the selected process code,
which satisfies Vulcan's process-sheet validation.

The CSV headers are Vulcan's standard automotive field keys, so mapping suggestions should be
deterministic. `factory_master_reference.csv`, the JSON files, this README and `SOURCES.md` are
not operational uploads.

## Designed demo story

Set the dashboard filter to **6–12 August 2026**. The expected result is:

- 75.48% plan attainment and a 60.58% stress-week OEE;
- Orbital Welding Machine as the leading bottleneck, followed by Plate Rolling Machine;
- orbital-weld porosity and shell-roundness deviation as the main quality story;
- low, delayed stock for SA516 plate, SS316L pipe, SS316L flanges and argon;
- `IXG-2026-042` and `IXG-2026-048` as critical overdue/open orders;
- plate rolling and orbital welding shown as process attention areas;
- a third delayed project, `IXG-2026-045`, for a longer-horizon recovery discussion.

Compare exact totals and rankings with [expected_results.json](expected_results.json).

## Regenerate only the files

The generator uses Python's standard library and a fixed seed. It does not touch a database,
create users, modify Django configuration, or deploy anything:

```bash
python3 test-data/infinexxgen-chakan/generate_dataset.py
```

Regeneration overwrites only generated CSV/JSON files inside this folder.
