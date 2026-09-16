"use client";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  CircleGauge,
  Cloud,
  Database,
  Droplets,
  Factory,
  Gauge,
  Info,
  Layers3,
  Plus,
  RefreshCw,
  Settings2,
  Thermometer,
  Timer,
  UploadCloud,
  Waves,
  Wrench,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { Fragment, useState } from "react";
import type { DigitalTwinPayload, FactoryDetails, TwinLine, TwinProcess, TwinStatus } from "@/lib/factory-domain";
import { useFactory } from "@/lib/factory-context";
import { formatDuration } from "@/lib/formatters";

const emptyTwin: DigitalTwinPayload = {
  factory: { id: "", name: "", code: "", location: "", details: {} },
  summary: { lines: 0, processes: 0, machines: 0, running: 0, attention: 0, withoutData: 0 },
  lines: [],
};

const statusLabels: Record<TwinStatus, string> = {
  running: "Running",
  warning: "Needs attention",
  down: "Stopped",
  idle: "Idle",
  no_data: "No recent data",
};

function number(value: number | null | undefined, decimals = 0) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: decimals }).format(value || 0);
}

function reportedMetric(value: number | null, suffix: string, decimals = 1) {
  return value === null ? "Not reported" : `${number(value, decimals)}${suffix}`;
}

function reportedDate(value: string) {
  if (!value) return "No process sheet added";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function fact(details: FactoryDetails, key: keyof FactoryDetails) {
  const value = details[key];
  return value === undefined || value === null || value === "" ? null : value;
}

function StatusPill({ status }: { status: TwinStatus }) {
  return <span className={`twin-status twin-status-${status}`}><i />{statusLabels[status]}</span>;
}

function Metric({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note?: string }) {
  return <article className="twin-metric"><span>{icon}</span><div><small>{label}</small><strong className="numeric">{value}</strong>{note && <p>{note}</p>}</div></article>;
}

function ProcessDetail({ process }: { process: TwinProcess }) {
  const metrics = process.metrics;
  const processDataUrl = `/data?category=machines`;
  return <section className="panel twin-detail" aria-live="polite">
    <header className="twin-detail-header">
      <div className="twin-detail-title">
        <span className="twin-sequence">{String(process.sequence).padStart(2, "0")}</span>
        <div><p>{process.processType} cultivation stage</p><h2>{process.name}</h2><small>{process.code} · {process.description}</small></div>
      </div>
      <div className="twin-reported"><StatusPill status={process.status} /><small><CalendarClock size={12} /> Latest reported: {reportedDate(process.latestDate)}</small></div>
    </header>

    {!process.hasData && <div className="twin-data-callout"><Info size={17} /><div><strong>This crop stage is configured, but has no reported state.</strong><p>Scan machine QR codes or record observations to see movement, yield, climate and losses.</p></div><Link className="button button-primary" href={processDataUrl}><Database size={13} /> View Live Data</Link></div>}
    {process.hasData && process.dataStatus === "stale" && <div className="twin-data-callout twin-data-stale"><CalendarClock size={17} /><div><strong>This is an older reported state.</strong><p>The newest reading for this process is {process.dataAgeDays} days old. Add current QR scan data before using it for an operating decision.</p></div><Link className="button button-secondary" href={processDataUrl}><Database size={13} /> View Data Stream</Link></div>}

    <div className="twin-detail-body">
      <div className="twin-kpi-area">
        {process.hasData ? <><div className="twin-flow-balance" aria-label="Process quantity balance">
          <div><small>Input</small><strong>{number(metrics.input, 1)} <em>{process.inputUnit}</em></strong></div>
          <ArrowRight size={17} />
          <div><small>Output</small><strong>{number(metrics.output, 1)} <em>{process.outputUnit}</em></strong></div>
          <ArrowRight size={17} />
          <div className={(metrics.rejected ?? 0) > 0 ? "has-loss" : ""}><small>Rejected</small><strong>{metrics.rejected === null ? "Not reported" : <>{number(metrics.rejected, 1)} <em>{process.outputUnit}</em></>}</strong></div>
        </div>
        <div className="twin-metric-grid">
          <Metric icon={<CircleGauge size={16} />} label="Stage yield" value={reportedMetric(metrics.yieldRate, "%")} note="Accepted output ÷ total output" />
          <Metric icon={<Activity size={16} />} label="Throughput" value={reportedMetric(metrics.throughputPerHour, ` ${process.outputUnit}/hr`)} />
          {(metrics.cycleMinutes !== null || process.targetCycleMinutes !== null) && <Metric icon={<Timer size={16} />} label="Cycle time" value={reportedMetric(metrics.cycleMinutes, " min", 2)} note={process.targetCycleMinutes !== null ? `Target ${number(process.targetCycleMinutes, 2)} min` : undefined} />}
          <Metric icon={<AlertTriangle size={16} />} label="Downtime" value={formatDuration(metrics.downtimeMinutes)} />
          <Metric icon={<Zap size={16} />} label="Energy used" value={reportedMetric(metrics.energyKwh, " kWh")} />
          {(metrics.temperatureC !== null || process.targetTemperatureC !== null) && <Metric icon={<Thermometer size={16} />} label="Temperature" value={reportedMetric(metrics.temperatureC, " °C")} note={process.targetTemperatureC !== null ? `Target ${number(process.targetTemperatureC, 1)} °C` : undefined} />}
          {metrics.humidityPct !== null && <Metric icon={<Droplets size={16} />} label="Relative humidity" value={reportedMetric(metrics.humidityPct, "%")} />}
          {metrics.co2Ppm !== null && <Metric icon={<Cloud size={16} />} label="CO₂" value={reportedMetric(metrics.co2Ppm, " ppm", 0)} />}
          {metrics.substrateMoisturePct !== null && <Metric icon={<Waves size={16} />} label="Substrate moisture" value={reportedMetric(metrics.substrateMoisturePct, "%")} />}
          {metrics.waterLitres !== null && <Metric icon={<Droplets size={16} />} label="Water used" value={reportedMetric(metrics.waterLitres, " L", 0)} />}
          {(metrics.pressureBar !== null || process.targetPressureBar !== null) && <Metric icon={<Gauge size={16} />} label="Pressure" value={reportedMetric(metrics.pressureBar, " bar")} note={process.targetPressureBar !== null ? `Target ${number(process.targetPressureBar, 1)} bar` : undefined} />}
        </div></> : <div className="twin-process-awaiting"><CircleGauge size={25} /><strong>No KPI values yet</strong><p>Configured targets and equipment remain visible. Process KPIs appear only after a valid process sheet is imported.</p></div>}
      </div>

      <aside className="twin-machines">
        <div className="twin-section-heading"><div><p>Connected rooms & assets</p><h3>{process.machines.length} item{process.machines.length === 1 ? "" : "s"}</h3></div><Wrench size={17} /></div>
        <div className="twin-machine-list">
          {process.machines.map((machine) => <article key={machine.id}>
            <div><span className={`twin-machine-state twin-status-${machine.status}`}><i /></span><div><strong>{machine.name}</strong><small>{[machine.manufacturer, machine.model].filter(Boolean).join(" · ") || machine.code}</small></div></div>
            <dl>
              {machine.capacityPerHour > 0 && <div><dt>Capacity</dt><dd>{number(machine.capacityPerHour, 1)}/hr</dd></div>}
              {machine.powerKw > 0 && <div><dt>Power</dt><dd>{number(machine.powerKw, 1)} kW</dd></div>}
            </dl>
          </article>)}
          {!process.machines.length && <div className="twin-machine-empty"><Wrench size={17} /><span>No room or farm asset is assigned to this stage.</span></div>}
        </div>
        <div className="twin-detail-actions"><Link className="button button-secondary" href="/settings?tab=processes"><Settings2 size={13} /> Edit process</Link><Link className="button button-primary" href={processDataUrl}><Database size={13} /> View Live Data</Link></div>
      </aside>
    </div>
  </section>;
}

export function DigitalTwin() {
  const { intelligence, filters, loading, refresh } = useFactory();
  const twin = intelligence.digitalTwin ?? emptyTwin;
  const [selectedLineId, setSelectedLineId] = useState("");
  const [selectedProcessId, setSelectedProcessId] = useState("");
  const selectedLine = twin.lines.find((line) => line.id === selectedLineId) ?? twin.lines[0];
  const selectedProcess = selectedLine?.processes.find((process) => process.id === selectedProcessId) ?? selectedLine?.processes[0];
  const details = twin.factory.details ?? {};

  function selectLine(line: TwinLine) {
    setSelectedLineId(line.id);
    setSelectedProcessId(line.processes[0]?.id ?? "");
  }

  if (!twin.lines.length) return <>
    <header className="page-header twin-page-header"><div><h1 className="typography-display">{twin.factory.name || "Vulcan"} <span>cultivation flow.</span></h1><p className="page-subtitle typography-body">A stage-by-stage view of the mushroom factory and its latest reported room state.</p></div></header>
    <section className="panel twin-empty"><Factory size={31} /><h2 className="typography-headline">Build this mushroom factory&apos;s cultivation flow</h2><p className="typography-body">Add a farm wing, define its crop stages in order, then connect rooms and assets.</p><div><Link className="button button-primary" href="/settings?tab=processes"><Settings2 size={14} /> Set up crop flow</Link><Link className="button button-secondary" href="/data"><Database size={14} /> View Live Data Stream</Link></div></section>
  </>;

  return <>
    <header className="page-header twin-page-header">
      <div><h1 className="typography-display">{twin.factory.name} <span>cultivation flow.</span></h1><p className="page-subtitle typography-body">Latest stage and room conditions across the selected mushroom factory.</p></div>
      <button className="button button-secondary" onClick={() => void refresh()} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={14} /> {loading ? "Refreshing" : "Refresh state"}</button>
    </header>

    <section className="twin-summary" aria-label="Mushroom factory twin summary">
      <article><span><Layers3 size={16} /></span><div><small>Configured crop flow</small><strong>{twin.summary.lines} wing{twin.summary.lines === 1 ? "" : "s"} · {twin.summary.processes} stages</strong></div></article>
      <article><span><Wrench size={16} /></span><div><small>Connected rooms & assets</small><strong>{twin.summary.machines} items</strong></div></article>
      <article className="healthy"><span><CheckCircle2 size={16} /></span><div><small>Latest state</small><strong>{twin.summary.running} running</strong></div></article>
      <article className={twin.summary.attention ? "attention" : ""}><span><AlertTriangle size={16} /></span><div><small>Action needed</small><strong>{twin.summary.attention} process{twin.summary.attention === 1 ? "" : "es"}</strong></div></article>
    </section>

    <section className="panel twin-map">
      <header className="twin-map-header">
        <div><p>Farm model</p><h2>Crop-stage flow</h2></div>
        <div className="twin-factory-facts">
          {fact(details, "factoryType") && <span><Factory size={12} /> {String(fact(details, "factoryType"))}</span>}
          {fact(details, "facilityAreaM2") && <span>{number(Number(fact(details, "facilityAreaM2")))} m²</span>}
          {fact(details, "ratedCapacityPerDay") && <span>{number(Number(fact(details, "ratedCapacityPerDay")))} {String(fact(details, "productionUnit") ?? "units")}/day</span>}
          <span><CalendarClock size={12} /> Through {filters.to}</span>
        </div>
      </header>

      {twin.lines.length > 1 && <div className="twin-line-tabs" role="tablist" aria-label="Factory lines">{twin.lines.map((line) => <button key={line.id} className={selectedLine?.id === line.id ? "active" : ""} onClick={() => selectLine(line)} role="tab" aria-selected={selectedLine?.id === line.id}><i className={`twin-status-${line.status}`} />{line.name}<small>{line.processes.length} stages</small></button>)}</div>}

      {selectedLine && <div className="twin-line-title"><div><Waves size={15} /><span><strong>{selectedLine.name}</strong><small>{selectedLine.code}</small></span></div><StatusPill status={selectedLine.status} /></div>}
      <div className="twin-flow-scroll" tabIndex={0} aria-label={`${selectedLine?.name ?? "Factory"} process flow`}>
        <div className="twin-flow">
          <span className="twin-flow-terminal"><i />Input</span>
          <span className="twin-connector"><ArrowRight size={17} /></span>
          {selectedLine?.processes.map((process, index) => <Fragment key={process.id}>
            <button className={`twin-process-card twin-card-${process.status} ${selectedProcess?.id === process.id ? "selected" : ""}`} onMouseEnter={() => setSelectedProcessId(process.id)} onFocus={() => setSelectedProcessId(process.id)} onClick={() => setSelectedProcessId(process.id)} aria-pressed={selectedProcess?.id === process.id}>
              <span className="twin-process-card-top"><b>{String(process.sequence).padStart(2, "0")}</b><StatusPill status={process.status} /></span>
              <strong>{process.name}</strong>
              <small>{process.description}</small>
              <span className="twin-card-output"><em>Latest output</em><b>{process.hasData ? `${number(process.metrics.output, 1)} ${process.outputUnit}` : "Awaiting sheet"}</b></span>
              <span className="twin-card-machines">
                {process.machines.slice(0, 2).map((machine, machineIndex) => <Fragment key={machine.id}>{machineIndex > 0 && <i className="mini-connector" />}<span><i className={`twin-status-${machine.status}`} /><Wrench size={11} />{machine.name}</span></Fragment>)}
                {process.machines.length > 2 && <small>+{process.machines.length - 2}</small>}
              </span>
            </button>
            {index < selectedLine.processes.length - 1 && <span className="twin-connector"><ArrowRight size={17} /></span>}
          </Fragment>)}
          <span className="twin-connector"><ArrowRight size={17} /></span>
          <span className="twin-flow-terminal twin-output-terminal"><i />Output</span>
        </div>
      </div>
      <footer className="twin-map-key"><span><i className="twin-status-running" />On course</span><span><i className="twin-status-warning" />Needs attention</span><span><i className="twin-status-down" />Stopped</span><span><i className="twin-status-idle" />Idle</span><span><i className="twin-status-no_data" />No reported data</span><small>State reflects the newest approved room observation on or before the selected end date, not a live sensor feed.</small></footer>
    </section>

    {selectedProcess ? <ProcessDetail process={selectedProcess} /> : <section className="panel twin-empty twin-empty-compact"><Factory size={24} /><h2>No process is configured on this line</h2><Link className="button button-primary" href="/settings?tab=processes"><Plus size={13} /> Add process</Link></section>}
  </>;
}
