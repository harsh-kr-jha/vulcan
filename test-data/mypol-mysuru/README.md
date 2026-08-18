# MYPOL Mysuru synthetic test dataset

This folder contains a deterministic, import-ready test pack for Vulcan. It models MYPOL as a
factory user at its publicly listed Mysuru location.

## Important disclaimer

**Every operational value is synthetic.** These files are not MYPOL production records and do
not claim to reveal its capacities, customers, suppliers, equipment, recipes, costs, or actual
performance. Supplier names are deliberately anonymized. SKU and machine codes are test-only.

Public facts were used only to keep the scenario relevant:

- MYPOL publicly describes itself as a precision rubber engineering company based in Mysuru.
- Its public portfolio includes butyl automotive tubes, curing bags, envelopes, flaps, technical
  and engineering rubber products, custom compound mixing, and automotive/NVH components.
- A published company brochure describes more than 100 tube sizes spanning two-wheelers through
  tractor and OTR applications, and mentions two-wheeler rear-wheel dampers.
- The process assumptions follow generic rubber manufacturing: mixing, milling, extrusion or
  forming, curing/vulcanization, finishing, and inspection.

Research links and the boundary between sourced facts and assumptions are in [SOURCES.md](SOURCES.md).

## Dataset size

The generated pack covers **61 days: 1 June–31 July 2026**. It is intentionally large enough to
exercise mapping, validation, local persistence, filters, charts, alert generation, and lineage.
Exact row counts and SHA-256 checksums are recorded in [manifest.json](manifest.json).

| File | Vulcan dataset type | Purpose |
|---|---|---|
| `production.csv` | Production | Plan, actual, good, rejection, rework, time and OEE inputs |
| `downtime.csv` | Downtime | Machine/shift loss events and classified reasons |
| `quality.csv` | Quality | Inspection, rejection, rework and defect Pareto data |
| `inventory.csv` | Inventory | Daily material snapshots, consumption and receipt risk |
| `orders.csv` | Orders | Completed history plus current open/held production orders |
| `suppliers.csv` | Supplier deliveries | Promised versus actual delivery, quantity, acceptance and terms |
| `utilities.csv` | Steam & boiler utilities | Feedwater temperatures, condensate/flash recovery, steam generation, briquette use, GCV and efficiency |
| `factory_master_reference.csv` | Setup reference only | Lines, machines, SKUs, materials, suppliers, shifts and reason codes |
| `expected_results.json` | Verification reference | Exact final-week totals, OEE components, rankings and risks |

The seven operational files use Vulcan’s standard field keys, so deterministic mapping should
suggest every required field automatically.

## Import into Vulcan

For a complete, repeatable local automotive showcase, the preferred path is:

```bash
export DJANGO_DEBUG=true
export VULCAN_VARIANT=automotive
export CELERY_TASK_ALWAYS_EAGER=true
export DJANGO_DATABASE_URL='sqlite:///backend/automotive.sqlite3'
.venv/bin/python backend/manage.py migrate
.venv/bin/python backend/manage.py seed_mypol
```

`seed_mypol` verifies this manifest and every source checksum before changing the database. It
creates the MYPOL company and Mysuru factory, configures the source masters plus a detailed
four-line/23-process Factory Twin, and imports all seven operational files as completed, traceable
showcase uploads. It is local-only and refuses to run unless `VULCAN_VARIANT=automotive` and
`DJANGO_DEBUG=true`.

To exercise the browser's manual mapping and approval workflow instead:

1. Open **Factory setup** and create:
   - Factory name: `MYPOL Mysuru Plant`
   - Factory code: `MYP-MYS`
   - Location: `20P, KRS Road, Metagalli, Mysuru, Karnataka 570016`
   - Time zone: `Asia/Kolkata`
   - Currency: `INR`
2. Optionally create the lines, machines, SKUs, shifts and reason codes listed in
   `factory_master_reference.csv`. If skipped, Vulcan will correctly flag unknown master
   references as warnings while still allowing approved rows to import.
3. Open **Data upload → Add factory data → Excel / CSV**.
4. Import files in this order, selecting the matching data type each time:
   1. `production.csv`
   2. `downtime.csv`
   3. `quality.csv`
   4. `inventory.csv`
   5. `orders.csv`
   6. `suppliers.csv`
   7. `utilities.csv`
5. Accept the suggested mappings, review validation, and approve accepted rows.
6. On the command centre, keep the date filter at `2026-07-25` to `2026-07-31` for the designed
   stress scenario. Use a wider date range to test trends and volume.
7. Compare the combined result with `expected_results.json`. Small display-rounding differences
   are acceptable; the underlying totals and rankings should match.

## Expected final-week signals

- `Tube Cure Press HC-02` is designed to be the leading bottleneck because of a recurring
  synthetic steam-control-valve fault.
- `MYP-ORD-AT-RISK-01` and `MYP-ORD-AT-RISK-02` are open one day before their due date.
- `Butyl Rubber IIR Grade A` and `Valve Stem Assembly TR78A` have low cover and delayed receipts.
- `MYP-TUBE-1100-20` has an elevated rejection pattern led by `Valve base leak`.
- Production is below plan and OEE is below the default target in the final week.
- Feedwater heat recovery rises while specific briquette use falls in the final fortnight.

These deliberately correlated events let you test whether Vulcan links production loss, order
risk, material risk, quality loss, alerts, recommendations, and operational answers coherently.

## Regenerate

The generator uses only Python’s standard library and a fixed seed:

```bash
python3 test-data/mypol-mysuru/generate_dataset.py
```

Regeneration overwrites only generated CSV files and `manifest.json` inside this folder.
