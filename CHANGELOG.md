# Changelog

All notable changes to Vulcan are documented in this file.

## 2026-08-01 — V2.3 custom metrics and source visibility

### Added

- Database-backed custom KPI builder on Data Visualisation with approved variables from
  production, downtime, quality, inventory, supplier, and order sheets.
- Safe arithmetic operations, result scaling, display units, precision controls, and
  server-side calculation without arbitrary formula execution.
- Add to Home control for custom KPIs, persisted independently for each factory.
- On-demand source-data preview for CSV and XLSX imports, showing up to 50 preserved rows
  directly from Django with original headers and values.

### Changed

- Setup Help now appears only once at the bottom of the sidebar and opens the working FAQ
  and documentation route.
- FAQ rendering uses stable native disclosure controls while retaining help search.
- Data Upload source history now provides a clear Preview action alongside lineage details.

### Verification

- Django tests cover preserved source preview plus custom KPI persistence, calculation,
  available variables, and Home pin state.
- 14 Django API and isolation tests pass.
- Ruff, ESLint, TypeScript, and the Next.js production build pass.

## 2026-07-31 — V2.2 guided setup and calculation transparency

### Added

- Functional Setup Help page with searchable FAQs, expandable answers, step-by-step
  documentation, and direct links into each setup workflow.
- Dedicated Rules & Targets page under Manage with grouped factory effectiveness,
  operational guardrail, inventory, and supplier thresholds.
- Data Visualisation page showing live KPI results, source inputs, exact Django formulae,
  assumptions, configured targets, OEE decomposition, and data-source lineage.

### Changed

- Factory Setup now focuses only on factory identity, masters, shifts, and reason codes.
- Manage navigation now exposes Factory Setup, Rules & Targets, Data Visualisation, and Help.
- The topbar hamburger remains above the open mobile sidebar and toggles it closed directly.

### Verification

- 14 Django API and isolation tests pass.
- Ruff, ESLint, TypeScript, and the Next.js production build pass.

## 2026-07-31 — V2.1 data freshness and inventory clarity

### Added

- Dataset-specific missing and stale data notices on Home, with direct actions that open
  the upload dialogue already set to the required sheet type.
- Inventory units in the standard template, generated sample data, backend intelligence,
  and inventory risk display.

### Changed

- Inventory analysis now shows the actual quantity and unit beside calculated days of cover.
- Removed the unnecessary “Operational answers” label from the application header.
- Removed Plan attainment from dashboards and editable KPI targets to reduce duplication.
- Made the mobile hamburger control toggle the sidebar and used the same familiar control to close it.
- Replaced the inventory cover chart with a more readable operational balance list.

### Verification

- 14 Django API and isolation tests pass, including inventory unit persistence and stale-data status.
- Ruff, ESLint, TypeScript, and the Next.js production build pass.

## 2026-07-31 — V2 supplier and performance intelligence

### Added

- Supplier-delivery CSV/XLSX template with promised and actual dates, order fulfillment,
  accepted quantity, and delivery-term compliance.
- Explainable 100-point supplier score: 60% on-time delivery, 25% quantity fulfillment,
  10% accepted quality, and 5% agreed-term fulfillment.
- Supplier scorecards, supplier alerts, configurable supplier targets, and a deterministic
  96-row synthetic supplier dataset.
- Throughput rate, cycle-time variance, estimated downtime loss, estimated speed loss,
  downtime frequency, average stoppage duration, rejection rate, and rework rate.
- Data-availability signals so the frontend knows which analyses have supporting records.

### Changed

- Simplified Home into a clear sequence of summary metrics, output trend, major losses,
  supplier performance, and priority exceptions.
- Performance now shows only analysis tabs supported by the selected factory's uploads.
- Empty charts are replaced with concise next-step guidance or a positive all-clear state.
- Increased typography and control sizes across dashboards, uploads, validation, alerts,
  tables, and setup screens.
- Extended supplier-delivery validation for quantity reconciliation and terms status.

### Verification

- Django system checks pass.
- 13 backend tests pass, including supplier upload, validation, persistence, scoring, and alerts.
- Ruff, ESLint, and TypeScript checks pass.
- Next.js production build succeeds.
