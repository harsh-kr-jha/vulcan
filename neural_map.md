# Vulcan Mushroom - Neural Map of Project Logic

```mermaid
graph TD
    subgraph Sources["1. Raw Data & Ingestion Layer"]
        Sheets["Farm Observation Sheets<br/>(Harvest, Downtime, Quality, Inventory)"]
        Sensors["IoT Sensor Telemetry<br/>(Temp, Humidity, CO2, Moisture)"]
        VendorLogs["Supplier Delivery Records<br/>(GRN, PO, Quality Inspection)"]
    end

    subgraph BackendEngine["2. Django Processing & Analytics Engine"]
        IngestAPI["Data Validation & Ingestion API<br/>(/api/uploads/)"]
        LineageDB["Authoritative Storage & Lineage DB<br/>(Standardised Records)"]
        DeterministicEngine["Deterministic Analytics Engine<br/>(Calculates BE, Yield, Downtime, Compliance)"]
        TwinStateEngine["Digital Twin State Engine<br/>(Layouts, Machines, Sensor Buffers)"]
    end

    subgraph StateLayer["3. Frontend State & Context Layer"]
        FactoryContext["Factory Context (useFactory)<br/>- activeFactoryId<br/>- filters (date, room, batch)<br/>- intelligence snapshot<br/>- twinFeed telemetry"]
        CommandBar["Command Filters & Navigation<br/>(Date Range, Shift, Farm Switcher)"]
    end

    subgraph UIViews["4. Specialized Analytical Surfaces"]
        DashView["Overview Dashboard (/dashboard)<br/>- Live Room Climate Gauges<br/>- Immediate Production Status<br/>- Critical Alerts & Action Items"]
        PerfView["Performance Explorer (/performance)<br/>- Cultivation: Biological Efficiency, Attainment<br/>- Harvest: Good vs Planned Yield Trend<br/>- Downtime: Pareto Loss Duration & Occurrences<br/>- Quality: Rejection & Contamination Rates<br/>- Inventory: Days of Stock Cover<br/>- Suppliers: Scorecard & Late Receipts"]
        TwinView["Digital Twin (/digital-twin)<br/>- Interactive Factory Floorplan<br/>- Machine Inspection & History Sheets<br/>- Dispatch & Inventory Tree Map"]
        MethodologyView["KPI Methodology (/methodology)<br/>- Calculation Formulas<br/>- Custom KPI Formula Builder"]
        DataView["Data Foundation (/data)<br/>- Upload Lineage & Mapping<br/>- Raw Preserved Source Review"]
    end

    subgraph DesignSystem["5. Vulcan Visual Design System"]
        BrandPalette["Vulcan Brand Palette<br/>#00A06C (Emerald) | #8DCCAD (Sage)<br/>#D8D2C8 (Stone) | #F4EBC3 (Parchment)<br/>#FFFFFF (Canvas)"]
        ContrastEyebrows["High-Contrast Eyebrows<br/>#121A14 container | #283E2E border | #FFFFFF text"]
        InteractiveModals["Methodology & Metric Info Modals<br/>(Esc listener, backdrop dismiss, formula code blocks)"]
    end

    %% Connections
    Sheets --> IngestAPI
    Sensors --> TwinStateEngine
    VendorLogs --> IngestAPI

    IngestAPI --> LineageDB
    LineageDB --> DeterministicEngine
    TwinStateEngine --> DeterministicEngine

    DeterministicEngine --> FactoryContext
    TwinStateEngine --> FactoryContext
    CommandBar --> FactoryContext

    FactoryContext --> DashView
    FactoryContext --> PerfView
    FactoryContext --> TwinView
    FactoryContext --> MethodologyView
    FactoryContext --> DataView

    BrandPalette --> DesignSystem
    ContrastEyebrows --> DesignSystem
    InteractiveModals --> DesignSystem
    DesignSystem -.-> UIViews
```

---

## Logic Flow Highlights

1. **Ingestion & Validation Pipeline**:
   - Mapped once per source type. Invalid rows are rejected with explicit discrepancy notes, preserving raw lineage.
2. **Deterministic Calculation**:
   - Zero synthetic smoothing or interpolated metrics.
   - Biological Efficiency = Total Harvest kg ÷ Unique Dry Substrate kg × 100 (batch deduplicated).
   - Climate Compliance = Room readings inside stage limits ÷ Total evaluated readings × 100.
3. **Telemetry & Digital Twin Stream**:
   - Direct real-time binding between room sensors, crop stage setpoints, and interactive visual floorplan.
4. **Ergonomic Presentation**:
   - Tabular figures (`tnum`) across all metrics tables and cards.
   - Dual-layer semantic tokens ensuring WCAG AA (>= 4.5:1) text contrast.
