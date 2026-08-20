# Implementation Plan: Factory Twin Builder

## Overview

This plan implements the Factory Twin Builder feature across backend (Django) and frontend (Next.js/React/TypeScript). The implementation is structured in 10 phases: backend models, backend APIs, frontend state/types, floor canvas, machine placement, connection drawing, QR/data entry, visualization, inventory/dispatch panels, and integration wiring.

## Tasks

- [x] 1. Backend models and migrations (Django spatial app)
  - [x] 1.1 Create the `backend/apps/spatial/` Django app with `__init__.py`, `apps.py`, `models.py`, `admin.py`, `urls.py`, `serializers.py`, and `views.py`
    - Register the app in `backend/config/settings` INSTALLED_APPS
    - _Requirements: 14.1, 14.2, 14.6_

  - [x] 1.2 Implement `FactoryLayout`, `SpatialMachine`, `MachineParameter`, and `MachineCustomKpi` models
    - Follow the schema from the design document (UUIDModel, TenantScopedModel mixins)
    - Include field constraints: floor dimensions 1–10,000, machine name max 50 chars, param key max 64 chars alphanumeric/underscore, KPI name max 50 chars
    - Add UniqueConstraint for machine position per layout, param key per machine, KPI name per machine
    - _Requirements: 14.1, 3.6, 4.1, 4.3, 5.4_

  - [x] 1.3 Implement `MachineConnection`, `MachineObservation`, `InventoryConfiguration`, `InventoryChange`, `DispatchConfiguration`, and `DispatchEvent` models
    - Include ForeignKey relationships, JSON fields for materials/products, decimal fields for quantities
    - Add ordering and indexes per the design document
    - _Requirements: 14.1, 8.3, 7.3, 11.2, 11.3, 12.2, 15.4, 15.5_

  - [x] 1.4 Create and run database migrations for the spatial app
    - Generate migrations with `python manage.py makemigrations spatial`
    - Apply migrations with `python manage.py migrate`
    - _Requirements: 14.1_

  - [ ]* 1.5 Write unit tests for model constraints and validation
    - Test UniqueConstraint on machine position, param key uniqueness, KPI name uniqueness
    - Test floor dimension field range enforcement
    - _Requirements: 14.4, 14.5, 4.3, 3.6_

- [x] 2. Backend API endpoints (serializers, views, URL routing)
  - [x] 2.1 Implement serializers for `FactoryLayout` (nested machines, connections, inventory, dispatch)
    - `FactoryLayoutSerializer` with nested `SpatialMachineSerializer`, `MachineConnectionSerializer`
    - Validate machine positions within floor bounds
    - Validate connection references existing machine IDs
    - _Requirements: 14.1, 14.4, 14.5_

  - [x] 2.2 Implement serializers for `MachineParameter`, `MachineCustomKpi`, and observation submission
    - `MachineParameterSerializer` with key uniqueness validation (case-insensitive)
    - `MachineObservationSerializer` validating submitted values against parameter data types
    - _Requirements: 15.2, 15.3, 4.3, 4.4_

  - [x] 2.3 Implement serializers for inventory and dispatch operations
    - `InventoryChangeSerializer` validating removal doesn't exceed current stock
    - `DispatchEventSerializer` validating quantity range 0.01–999,999,999.99
    - _Requirements: 15.4, 15.5, 11.8_

  - [x] 2.4 Implement API views: `FactoryLayoutViewSet` (create, retrieve, partial_update)
    - POST `/layouts/` — create layout with machines and connections
    - GET `/layouts/?factory={id}` — retrieve layout for factory
    - PATCH `/layouts/{id}/` — update existing layout
    - Enforce tenant scoping on all operations (403 for cross-tenant access)
    - _Requirements: 14.1, 14.2, 14.3, 14.6_

  - [x] 2.5 Implement API views: machine entry schema and observations
    - GET `/machines/{id}/entry-schema/` — return field definitions
    - POST `/machines/{id}/observations/` — submit observation row with timestamp
    - GET `/machines/{id}/observations/` — retrieve latest observations
    - Return 404 if machine does not exist
    - _Requirements: 15.1, 15.2, 15.3, 15.6_

  - [x] 2.6 Implement API views: inventory and dispatch endpoints
    - POST `/inventory/{layout_id}/changes/` — submit inventory addition/removal
    - GET `/inventory/{layout_id}/` — get current inventory state with computed quantities
    - POST `/dispatch/{layout_id}/events/` — submit dispatch event
    - GET `/dispatch/{layout_id}/` — get current dispatch state with awaiting quantities
    - _Requirements: 15.4, 15.5, 15.6, 15.7, 15.8_

  - [x] 2.7 Register URL routing under `/api/backend/api/spatial/`
    - Wire all viewsets and views to the URL router
    - Ensure authentication is required on all endpoints
    - _Requirements: 15.7, 15.8_

  - [ ]* 2.8 Write integration tests for spatial API endpoints
    - Test create → retrieve → update layout cycle
    - Test observation submission with valid/invalid data
    - Test inventory removal exceeding stock (400 response)
    - Test tenant isolation (403 on cross-tenant access)
    - Test 404 for deleted machine observation submission
    - _Requirements: 14.4, 14.5, 14.6, 15.3, 15.6_

- [x] 3. Checkpoint - Ensure backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Frontend types and state management
  - [x] 4.1 Create `frontend/lib/spatial-types.ts` with all TypeScript interfaces
    - Define `FloorDimensions`, `GridPosition`, `MachineParameter`, `IOSpec`, `CustomKpi`, `KpiFormula`, `KpiOperation`, `MachineNode`, `ConnectionLine`, `InventoryMaterial`, `InventoryConfig`, `DispatchProduct`, `DispatchConfig`, `FactoryLayout`, `BuilderMode`, `BuilderState`
    - Define type unions: `UnitSystem`, `MachineStatus`, `ParamDataType`
    - _Requirements: 1.3, 2.1, 3.3, 4.1, 4.2, 5.1, 8.4, 8.5, 10.5, 11.2, 12.2_

  - [x] 4.2 Create `frontend/lib/factory-builder-context.tsx` with `FactoryBuilderContext` and `FactoryBuilderProvider`
    - Implement state reducer for `BuilderState` transitions (idle, placing, connecting, configuring)
    - Implement `initFloor`, `placeMachine`, `configureMachine`, `removeMachine`, `moveMachine`
    - Implement `startConnection`, `completeConnection`, `cancelConnection`, `configureConnection`, `removeConnection`
    - Implement `configureInventory`, `configureDispatch`
    - Implement `saveLayout`, `cancelEdit`, `enterEditMode`
    - Implement helpers: `isPositionOccupied`, `getConnectionDistance`
    - _Requirements: 1.4, 3.1, 3.5, 3.6, 8.1, 8.3, 8.6, 8.7, 9.1, 9.2, 13.1, 13.2, 13.7_

  - [x] 4.3 Implement validation utility functions in `frontend/lib/spatial-validators.ts`
    - `validateFloorDimensions`: reject non-numeric, zero, negative, > 10,000
    - `validateMachineName`: 1–50 chars
    - `validateParameterKey`: 1–64 alphanumeric/underscore, case-insensitive uniqueness check
    - `validateKpiFormula`: max 10 param references, numeric params only
    - `validateConnectionQuantity`: 0.01–999,999,999.99
    - _Requirements: 1.6, 1.7, 2.6, 2.7, 3.3, 4.1, 4.3, 5.2, 5.3, 8.5_

  - [ ]* 4.4 Write property test: Floor dimension validation (Property 1)
    - **Property 1: Floor dimension validation rejects invalid inputs**
    - Use fast-check to generate values outside 1–10,000 (zero, negative, > 10,000, non-finite) and verify rejection; generate values in range and verify acceptance
    - **Validates: Requirements 1.6, 1.7, 2.6, 2.7**

  - [ ]* 4.5 Write property test: Parameter key uniqueness (Property 3)
    - **Property 3: Parameter key uniqueness within a machine**
    - Use fast-check to generate parameter key sets and verify case-insensitive duplicate detection
    - **Validates: Requirements 4.3, 4.4**

  - [ ]* 4.6 Write property test: KPI formula evaluation safety (Property 4)
    - **Property 4: KPI formula evaluation safety**
    - Use fast-check to generate formula scenarios with missing values and division-by-zero, verify "Unavailable" result
    - **Validates: Requirements 5.6, 5.7**

  - [ ]* 4.7 Write property test: Connection distance calculation (Property 5)
    - **Property 5: Connection distance calculation correctness**
    - Use fast-check to generate pairs of grid positions, verify Euclidean distance rounded to 1 decimal place
    - **Validates: Requirements 8.2**

- [x] 5. Frontend floor canvas and grid (SVG-based)
  - [x] 5.1 Create `FloorCanvas` SVG component in `frontend/components/digital-twin/builder/FloorCanvas.tsx`
    - Render SVG with `viewBox` based on floor dimensions
    - Implement `GridLayer` sub-component with virtual grid lines (render only visible cells)
    - Display axis labels at intervals of no more than 10 cells with cumulative distances
    - _Requirements: 2.1, 2.2, 2.4_

  - [x] 5.2 Implement zoom and pan interactions on `FloorCanvas`
    - Mouse wheel / pinch gesture adjusts `viewBox` dimensions (min: 1 cell visible, max: entire floor)
    - Pointer drag on empty space translates `viewBox` origin
    - Clamp panning so it cannot scroll beyond floor boundaries
    - _Requirements: 2.3_

  - [x] 5.3 Implement cursor cell highlighting in edit mode
    - Track pointer position, compute grid cell coordinates
    - Apply differentiated background style to the cell under cursor
    - Only active in edit mode
    - _Requirements: 2.5_

  - [x] 5.4 Create `FactoryBuilderDialog` component for factory initiation
    - Prompt for width and height (numeric inputs)
    - Unit system selector defaulting to meters
    - Inline validation: non-numeric, zero, negative, >10,000 show error and disable confirm
    - Cancel closes dialog without changes
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8_

- [x] 6. Frontend machine placement and configuration
  - [x] 6.1 Implement machine placement interaction on `FloorCanvas`
    - Click on unoccupied cell in edit mode opens `MachineConfigPanel`
    - Click on occupied cell shows unavailability indicator (red highlight + toast)
    - _Requirements: 3.1, 3.2, 3.6_

  - [x] 6.2 Create `MachineConfigPanel` slide-over component
    - `BasicInfoSection`: machine name input (1–50 chars, required)
    - I/O specifications: 0–10 inputs, 0–10 outputs (label 1–30 chars, unit type)
    - Confirm and cancel actions
    - _Requirements: 3.3, 3.4, 3.5, 3.7_

  - [x] 6.3 Implement `ParametersSection` in `MachineConfigPanel`
    - Add up to 50 parameters with key name (1–64 alphanumeric/underscore), data type selection (number, text, boolean, date, selection)
    - Selection type: enumerated list of up to 20 options (each 1–100 chars)
    - Validate key uniqueness (case-insensitive), show error on duplicate
    - Support remove and reorder operations
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 6.4 Implement `KpiSection` in `MachineConfigPanel`
    - Create Custom KPIs (up to 20 per machine)
    - Formula builder: select numeric parameters only, arithmetic operators (add, subtract, multiply, divide), max 10 parameter references
    - KPI name (1–50 chars, unique per machine) and display unit (1–20 chars)
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 6.5 Render placed `MachineNode` elements on `FloorCanvas`
    - Display machine name at grid position
    - Support drag to move (edit mode), right-click/long-press for remove
    - Connection anchor points visible for drag-to-connect
    - _Requirements: 3.5, 13.2, 13.5_

  - [ ]* 6.6 Write property test: Machine placement occupancy invariant (Property 2)
    - **Property 2: Machine placement occupancy invariant**
    - Use fast-check to generate sequences of placements, verify no two machines share a position and occupied positions are rejected
    - **Validates: Requirements 3.1, 3.6**

  - [ ]* 6.7 Write property test: Machine removal cascades connections (Property 6)
    - **Property 6: Machine removal cascades connections**
    - Use fast-check to generate layouts with machines and connections, remove a machine, verify all related connections are removed
    - **Validates: Requirements 13.5**

- [x] 7. Frontend connection drawing
  - [x] 7.1 Implement `ConnectionDrawer` interaction on `FloorCanvas`
    - Drag from machine anchor renders provisional line following cursor with arrowhead
    - Display connection distance in selected unit at line midpoint, rounded to 1 decimal, updated in real time
    - Drop on different machine creates persistent connection; drop on empty space or same machine cancels
    - _Requirements: 8.1, 8.2, 8.3, 8.6, 8.7_

  - [x] 7.2 Create `ConnectionConfigPanel` slide-over component
    - Name (max 50 chars), description (max 200 chars)
    - Process parameters: material type (max 100 chars), quantity per cycle (0.01–999,999,999.99), input spec, output spec
    - _Requirements: 8.4, 8.5_

  - [x] 7.3 Render persistent `ConnectionLine` elements on `FloorCanvas`
    - SVG path with arrowhead indicating direction
    - Display connection name on hover, edit/remove in edit mode
    - _Requirements: 8.3, 13.4_

- [x] 8. Checkpoint - Ensure frontend builder components render correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Frontend QR code generation and data entry page
  - [x] 9.1 Implement QR code generation utility in `frontend/lib/qr-generator.ts`
    - Use `qrcode` npm package for SVG generation
    - Generate machine QR: `{ORIGIN}/digital-twin/entry/{machineId}`
    - Generate inventory QR: `{ORIGIN}/digital-twin/inventory/{layoutId}`
    - Generate dispatch QR: `{ORIGIN}/digital-twin/dispatch/{layoutId}`
    - _Requirements: 6.1, 6.2, 6.3, 11.6, 12.5_

  - [x] 9.2 Create `QrCodePreview` component in `MachineConfigPanel`
    - Display QR code SVG after machine save
    - Machine name label beneath (truncated at 50 chars with ellipsis)
    - Print action producing output at minimum 2cm × 2cm via `@media print`
    - _Requirements: 6.4, 6.5_

  - [x] 9.3 Create data entry page at `frontend/app/digital-twin/entry/[machineId]/page.tsx`
    - Fetch field definitions from GET `/machines/{id}/entry-schema/`
    - Render fields in configured order: numeric keypad for numbers, date picker for dates, toggle for booleans, dropdown for selections, text input for text
    - Mobile-responsive (320px+ without horizontal scrolling)
    - _Requirements: 7.1, 7.2, 7.6_

  - [x] 9.4 Implement data submission logic on the data entry page
    - POST observation to `/machines/{id}/observations/`
    - On success: show confirmation, reset form fields
    - On missing required fields: highlight with error indicators, prevent submission
    - On network/server error: show error message, retain entered data for retry
    - Handle 404 (deleted machine): display "Machine no longer exists" error
    - _Requirements: 7.3, 7.4, 7.5, 7.7, 6.6, 6.7_

  - [ ]* 9.5 Write property test: Observation round-trip persistence (Property 8)
    - **Property 8: Observation round-trip persistence**
    - Use fast-check to generate valid observations conforming to parameter definitions, submit and retrieve, verify identical values
    - **Validates: Requirements 7.3, 15.2**

- [x] 10. Frontend factory visualization
  - [x] 10.1 Create `FactoryVisualization` component with isometric floor and 3D machine boxes
    - CSS isometric transforms (`rotateX()`/`rotateY()`) for 3D appearance
    - Render each machine as a 3D box placeholder at saved grid position
    - Apply status-based color coding: running, warning, down, idle, no_data
    - _Requirements: 10.1, 10.5_

  - [x] 10.2 Render connection paths in visualization mode
    - SVG curves between connected machines
    - Display connection names, truncated at 24 chars with ellipsis
    - _Requirements: 10.2_

  - [x] 10.3 Implement hover tooltip and long-press support
    - Hover over machine: show tooltip with name, operational status, 3 most recently updated metrics
    - Long-press on touch devices: same tooltip
    - _Requirements: 10.3, 10.7_

  - [x] 10.4 Implement click/tap detail panel
    - Click/tap machine: open detail panel with latest submitted data and computed Custom KPIs
    - KPIs showing "Unavailable" when parameter data is missing or division by zero
    - Empty-state message when no data submitted
    - _Requirements: 10.4, 10.6, 5.5, 5.6, 5.7_

- [x] 11. Frontend inventory and dispatch panels
  - [x] 11.1 Create `InventoryPanel` component to the left of `FloorCanvas`
    - If not configured: show "Build Inventory" button
    - Configuration form: storage capacity (1–1,000,000), capacity unit (kg, litres, meters, units), materials (1–50 with name, unit, initial quantity)
    - _Requirements: 11.1, 11.2, 11.3_

  - [x] 11.2 Implement inventory tree map visualization using ECharts
    - Treemap with rectangle sizes proportional to material quantities
    - Zero-quantity materials rendered as minimal-size rectangle with visible name
    - Display Inventory_QR_Code within the panel
    - _Requirements: 11.4, 11.5, 11.6_

  - [x] 11.3 Create inventory QR data entry page at `frontend/app/digital-twin/inventory/[layoutId]/page.tsx`
    - List configured materials, select material, choose addition/removal, enter quantity
    - Reject removal exceeding current stock with error message
    - On valid submission, inventory updates within 5 seconds
    - _Requirements: 11.7, 11.8, 11.9_

  - [x] 11.4 Create `DispatchPanel` component to the right of `FloorCanvas`
    - If not configured: show "Build Dispatch" placeholder
    - Configuration form: products (1–50 with name 1–50 chars, unit)
    - Error if saving with zero products
    - _Requirements: 12.1, 12.2, 12.3_

  - [x] 11.5 Implement dispatch tree map visualization and QR code
    - Treemap with rectangle sizes proportional to awaiting quantities (arrived minus dispatched)
    - Display Dispatch_QR_Code within the panel
    - _Requirements: 12.4, 12.5_

  - [x] 11.6 Create dispatch QR data entry page at `frontend/app/digital-twin/dispatch/[layoutId]/page.tsx`
    - Select event type (arrival for dispatch / actual dispatch), select product, enter quantity (0.01–999,999,999.99)
    - Record product, event type, quantity, unit, timestamp
    - Validate required fields and quantity range; show errors on failure
    - _Requirements: 12.6, 12.7, 12.8_

  - [ ]* 11.7 Write property test: Inventory change validation (Property 7)
    - **Property 7: Inventory change validation**
    - Use fast-check to generate inventory states and removal amounts, verify rejections when exceeding stock and correct quantity computation on valid removals
    - **Validates: Requirements 11.8, 11.9**

- [x] 12. Checkpoint - Ensure panels, QR pages, and visualization render correctly
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Integration and save/load flow
  - [x] 13.1 Implement save layout flow in `FactoryBuilderContext`
    - POST/PATCH to backend API with full layout payload (machines, connections, inventory, dispatch, floor dimensions)
    - Show loading indicator during save, disable save button to prevent duplicates
    - On success: transition to visualization mode within 2 seconds
    - On failure: show error banner, retain unsaved layout in editor
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.6_

  - [x] 13.2 Implement load layout flow on Digital Twin page
    - If no layout exists: show "Build Factory" button
    - If layout exists: load from GET API, render `FactoryVisualization` with saved machines and connections
    - _Requirements: 1.1, 9.5_

  - [x] 13.3 Implement edit mode re-entry flow
    - "Edit Layout" button in visualization mode
    - Load saved state into builder context for editing
    - Support: move, rename, remove machines; add/remove machines and connections
    - Confirmation dialog when removing machine with existing observation data
    - "Save" persists changes, "Cancel" discards and returns to last saved state
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_

  - [x] 13.4 Wire `FactoryTwinPage` as top-level orchestrator
    - Replace existing `DigitalTwin` component content with dual-mode (builder/visualization)
    - Integrate `FactoryBuilderProvider`, `FloorCanvas`, `InventoryPanel`, `DispatchPanel`, `FactoryVisualization`
    - Ensure QR code generation triggers client-side on machine save (within 5 seconds)
    - _Requirements: 1.1, 1.4, 6.1, 9.3, 11.1, 12.1_

  - [ ]* 13.5 Write property test: Layout serialization round-trip (Property 9)
    - **Property 9: Layout serialization round-trip**
    - Use fast-check to generate valid FactoryLayout objects, serialize to API payload, deserialize, verify equivalence
    - **Validates: Requirements 9.2, 9.5, 14.1, 14.2**

  - [ ]* 13.6 Write property test: Tenant isolation (Property 10)
    - **Property 10: Tenant isolation on all spatial endpoints**
    - Use fast-check to generate tenant/user combinations, verify 403 on cross-tenant access
    - **Validates: Requirements 14.6**

- [x] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (fast-check library)
- Unit tests validate specific examples and edge cases
- Backend uses Django REST Framework with TenantScopedModel for multi-tenant isolation
- Frontend uses custom SVG (no react-konva), ECharts treemaps (already in deps), CSS isometric transforms (no WebGL), and `qrcode` npm package for QR generation
- New routes: `app/digital-twin/entry/[machineId]/page.tsx`, `app/digital-twin/inventory/[layoutId]/page.tsx`, `app/digital-twin/dispatch/[layoutId]/page.tsx`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "4.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "4.2", "4.3"] },
    { "id": 2, "tasks": ["1.4", "4.4", "4.5", "4.6", "4.7"] },
    { "id": 3, "tasks": ["1.5", "2.1", "2.2", "2.3", "5.1", "5.4"] },
    { "id": 4, "tasks": ["2.4", "2.5", "2.6", "5.2", "5.3"] },
    { "id": 5, "tasks": ["2.7", "2.8", "6.1", "6.2"] },
    { "id": 6, "tasks": ["6.3", "6.4", "6.5", "7.1"] },
    { "id": 7, "tasks": ["6.6", "6.7", "7.2", "7.3"] },
    { "id": 8, "tasks": ["9.1", "10.1", "11.1", "11.4"] },
    { "id": 9, "tasks": ["9.2", "9.3", "10.2", "10.3", "11.2", "11.5"] },
    { "id": 10, "tasks": ["9.4", "9.5", "10.4", "11.3", "11.6", "11.7"] },
    { "id": 11, "tasks": ["13.1", "13.2"] },
    { "id": 12, "tasks": ["13.3", "13.4"] },
    { "id": 13, "tasks": ["13.5", "13.6"] }
  ]
}
```
