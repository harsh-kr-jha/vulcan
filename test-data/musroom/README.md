# Musroom synthetic cultivation dataset

This deterministic sample pack models a climate-controlled button mushroom farm for the seven
days ending 5 August 2026. Every value is synthetic and is not a verified operational fact.

| File | Import type | Purpose |
|---|---|---|
| `room_observations.csv` | Process sheets | Room climate, watering, treatment and crop-batch state |
| `harvest.csv` | Harvest | Planned, harvested, saleable, downgraded and discarded kg by room |
| `room_downtime.csv` | Room downtime | HVAC and fogger interruptions |
| `crop_quality.csv` | Crop quality | Inspection, contamination, downgrade and quality reasons |
| `inventory.csv` | Inventory | Material balance, consumption, stock cover and incoming receipts |
| `supplier_receipts.csv` | Supplier receipts | Delivery, quantity, acceptance and terms performance |
| `customer_orders.csv` | Customer orders | Required versus packed mushroom kg and due dates |
| `crop_cycles.csv` | Crop cycle master | Room/batch lifecycle, value, timing, ownership and progress |
| `crop_stages.csv` | Crop cycle stages | Compost-to-cold-room stage execution for each crop batch |

Configure the farm masters from `factory_master_reference.csv`, then import the files in the
order shown above, with `crop_cycles.csv` before `crop_stages.csv`. Alternatively run:

```bash
.venv/bin/python backend/manage.py seed_mushroom
```

That command can seed data without a user. To sign in to the seeded workspace, set both
`MUSHROOM_DEMO_EMAIL` and `MUSHROOM_DEMO_PASSWORD` before running it, following the credential
rules in the [root development guide](../../README.md#lightweight-local-development). The command
has no default password and rotates the opt-in development account on each run.

Only the synthetic files in this directory are repository fixtures. Do not copy photographed or
real farm records from the ignored `MUSHROOM-DATA/` directory into Git.

Regenerate the CSV files and `manifest.json` with:

```bash
python3 test-data/musroom/generate_dataset.py
```
