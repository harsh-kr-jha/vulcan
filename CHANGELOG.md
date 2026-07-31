# Changelog

All notable changes to Vulcan are documented in this file.

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
