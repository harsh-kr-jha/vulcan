"use client";

import {
  AlertTriangle,
  BookMarked,
  Check,
  ChevronRight,
  Copy,
  Database,
  Expand,
  Gauge,
  Info,
  Layers3,
  LoaderCircle,
  Ruler,
  Search,
  Tags,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/api-client";
import type {
  DimensionOptions,
  DimensionResult,
  LibraryCatalog,
  LibrarySearchResult,
  RatingOptions,
  RatingResult,
} from "@/lib/digital-library-domain";

const STANDARD_CODE = "ASME-B16-5";
type LibraryView = "overview" | "ratings" | "dimensions" | "materials";
type SearchTarget = Record<string, string | number>;

function SourceReference({ children }: { children: React.ReactNode }) {
  return <span className="library-source"><BookMarked size={13} /> {children}</span>;
}

function SelectField({
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="library-select-field">
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select {label.toLocaleLowerCase("en-US")}</option>
        {children}
      </select>
    </label>
  );
}

function TechnicalSchematic({ result }: { result: DimensionResult }) {
  const [zoom, setZoom] = useState(1);
  const [labelsVisible, setLabelsVisible] = useState(true);
  const frameRef = useRef<HTMLDivElement>(null);
  const isBlind = result.component.code === "blind";
  const isWeldingNeck = result.component.code === "welding-neck";

  return (
    <div className="library-figure" ref={frameRef}>
      <div className="library-figure-toolbar">
        <button type="button" onClick={() => setZoom((value) => Math.max(0.8, value - 0.2))} aria-label="Zoom out"><ZoomOut size={15} /></button>
        <button type="button" onClick={() => setZoom((value) => Math.min(2, value + 0.2))} aria-label="Zoom in"><ZoomIn size={15} /></button>
        <button type="button" className={labelsVisible ? "active" : ""} onClick={() => setLabelsVisible((value) => !value)}>Labels</button>
        <button type="button" onClick={() => void frameRef.current?.requestFullscreen()} aria-label="Open figure full screen"><Expand size={15} /></button>
      </div>
      <div className="library-figure-canvas">
        <svg viewBox="0 0 420 260" role="img" aria-label={`${result.component.name} dimensional schematic`} style={{ transform: `scale(${zoom})` }}>
          <defs>
            <linearGradient id="flangeSteel" x1="0" x2="1"><stop offset="0" stopColor="#dce5e0" /><stop offset="1" stopColor="#f7faf8" /></linearGradient>
            <marker id="dimensionArrow" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse"><path d="M0,0 L7,3.5 L0,7 Z" fill="#53645d" /></marker>
          </defs>
          <path
            className="schematic-body"
            fill="url(#flangeSteel)"
            d={isBlind ? "M105 75 H315 V185 H105 Z" : isWeldingNeck ? "M72 76 H148 L190 112 H348 V148 H190 L148 184 H72 Z" : "M72 76 H160 V104 H348 V156 H160 V184 H72 Z"}
          />
          {!isBlind && <path className="schematic-bore" d="M78 117 H345 M78 143 H345" />}
          <circle cx="118" cy="98" r="7" className="schematic-hole" />
          <circle cx="118" cy="162" r="7" className="schematic-hole" />
          {labelsVisible && <>
            <path className="dimension-line" d="M72 52 H348" />
            <path className="dimension-tick" d="M72 58 V42 M348 58 V42" />
            <text x="207" y="44">O</text>
            <path className="dimension-line" d="M48 76 V184" />
            <path className="dimension-tick" d="M42 76 H58 M42 184 H58" />
            <text x="29" y="134">tf</text>
            {!isBlind && <>
              <path className="dimension-line" d="M360 117 V143" />
              <text x="370" y="134">B</text>
              <path className="dimension-line" d="M72 208 H348" />
              <text x="207" y="226">Y</text>
            </>}
            <path className="dimension-line arrowed" d="M118 98 V162" markerStart="url(#dimensionArrow)" markerEnd="url(#dimensionArrow)" />
            <text x="128" y="134">W</text>
          </>}
        </svg>
      </div>
      <div className="library-figure-caption"><strong>{result.figure?.title ?? `${result.component.name} schematic`}</strong><span>Interactive relationship diagram · not to scale</span></div>
    </div>
  );
}

function RatingExplorer({ seed }: { seed: SearchTarget | null }) {
  const [options, setOptions] = useState<RatingOptions | null>(null);
  const [result, setResult] = useState<RatingResult | null>(null);
  const [group, setGroup] = useState(seed?.materialGroup ? String(seed.materialGroup) : "");
  const [material, setMaterial] = useState(seed?.material ? String(seed.material) : "");
  const [pressureClass, setPressureClass] = useState(seed?.pressureClass ? String(seed.pressureClass) : "");
  const [temperature, setTemperature] = useState("");
  const [units, setUnits] = useState("metric");
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  useEffect(() => {
    const current = ++requestId.current;
    const params: Record<string, string> = { units };
    if (group) params.material_group = group;
    if (material) params.material = material;
    if (pressureClass) params.pressure_class = pressureClass;
    if (temperature) params.temperature = temperature;
    void api.library.ratings(STANDARD_CODE, params).then((payload) => {
      if (requestId.current !== current) return;
      setOptions(payload.options);
      setResult(payload.result);
    }).finally(() => {
      if (requestId.current === current) setLoading(false);
    });
  }, [group, material, pressureClass, temperature, units]);

  return (
    <div className="library-explorer">
      <div className="library-explorer-heading"><span><Gauge size={21} /></span><div><p>Engineering data explorer</p><h2>Pressure–temperature rating</h2><small>Selections narrow against published structured records.</small></div></div>
      <div className="library-filter-grid rating-filter-grid">
        <SelectField label="Material group" value={group} onChange={(value) => { setLoading(true); setGroup(value); setMaterial(""); setPressureClass(""); setTemperature(""); }}>
          {options?.materialGroups.map((item) => <option key={item} value={item}>Group {item}</option>)}
        </SelectField>
        <SelectField label="Material" value={material} disabled={!group && !seed?.material} onChange={(value) => { setLoading(true); setMaterial(value); setPressureClass(""); setTemperature(""); }}>
          {options?.materials.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.productForm}</option>)}
        </SelectField>
        <SelectField label="Pressure class" value={pressureClass} disabled={!material} onChange={(value) => { setLoading(true); setPressureClass(value); setTemperature(""); }}>
          {options?.pressureClasses.map((item) => <option key={item} value={item}>Class {item}</option>)}
        </SelectField>
        <SelectField label="Temperature" value={temperature} disabled={!pressureClass} onChange={(value) => { setLoading(true); setTemperature(value); }}>
          {options?.temperaturesC.map((item) => <option key={item.value} value={item.value}>{item.label} °C</option>)}
        </SelectField>
        <SelectField label="Unit system" value={units} onChange={(value) => { setLoading(true); setUnits(value); }}>
          <option value="metric">Metric</option><option value="us-customary">U.S. customary</option>
        </SelectField>
      </div>
      {loading && <div className="library-loading-inline"><LoaderCircle size={18} /> Retrieving verified records…</div>}
      {!loading && !result && <div className="library-explorer-empty"><Gauge size={28} /><h3>Select a complete configuration</h3><p>Choose a material, pressure class, and tabulated temperature to retrieve its maximum allowable pressure.</p></div>}
      {result && !loading && <div className="rating-result-grid">
        <article className="rating-result-card">
          <div className="rating-result-label">Maximum allowable pressure</div>
          <strong>{result.maximumAllowablePressure.toLocaleString("en-IN")} <small>{result.pressureUnit}</small></strong>
          <div className="rating-result-context"><span>{result.material.name}</span><i /> <span>Class {result.pressureClass}</span><i /> <span>{result.temperature} {result.temperatureUnit}</span></div>
          <SourceReference>{result.source.standard} · Table {result.source.table}</SourceReference>
        </article>
        <aside className="library-note-card"><div><AlertTriangle size={18} /><strong>Applicable notes and restrictions</strong></div>{result.notes.map((note) => <p key={note}>{note}</p>)}</aside>
      </div>}
    </div>
  );
}

function DimensionExplorer({ seed }: { seed: SearchTarget | null }) {
  const [options, setOptions] = useState<DimensionOptions | null>(null);
  const [result, setResult] = useState<DimensionResult | null>(null);
  const [component, setComponent] = useState(seed?.component ? String(seed.component) : "");
  const [pressureClass, setPressureClass] = useState(seed?.pressureClass ? String(seed.pressureClass) : "");
  const [nps, setNps] = useState(seed?.nps ? String(seed.nps) : "");
  const [facing, setFacing] = useState("raised-face");
  const [units, setUnits] = useState("metric");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState("");
  const requestId = useRef(0);

  useEffect(() => {
    const current = ++requestId.current;
    const params: Record<string, string> = { units, facing };
    if (component) params.component = component;
    if (pressureClass) params.pressure_class = pressureClass;
    if (nps) params.nps = nps;
    void api.library.dimensions(STANDARD_CODE, params).then((payload) => {
      if (requestId.current !== current) return;
      setOptions(payload.options);
      setResult(payload.result);
    }).finally(() => {
      if (requestId.current === current) setLoading(false);
    });
  }, [component, pressureClass, nps, facing, units]);

  async function copyField(label: string, value: string | number, unit: string) {
    await navigator.clipboard.writeText(`${label}: ${value} ${unit}`);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1200);
  }

  return (
    <div className="library-explorer">
      <div className="library-explorer-heading"><span><Ruler size={21} /></span><div><p>Engineering data explorer</p><h2>Flange dimensions</h2><small>Component-dependent fields from native dimension records.</small></div></div>
      <div className="library-filter-grid">
        <SelectField label="Component type" value={component} onChange={(value) => { setLoading(true); setComponent(value); setPressureClass(""); setNps(""); }}>
          {options?.components.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
        </SelectField>
        <SelectField label="Pressure class" value={pressureClass} disabled={!component} onChange={(value) => { setLoading(true); setPressureClass(value); setNps(""); }}>
          {options?.pressureClasses.map((item) => <option key={item} value={item}>Class {item}</option>)}
        </SelectField>
        <SelectField label="Nominal pipe size" value={nps} disabled={!pressureClass} onChange={(value) => { setLoading(true); setNps(value); }}>
          {options?.sizes.map((item) => <option key={item.value} value={item.value}>NPS {item.label}</option>)}
        </SelectField>
        <SelectField label="Facing type" value={facing} disabled={!nps} onChange={(value) => { setLoading(true); setFacing(value); }}>
          {options?.facingTypes.map((item) => <option key={item} value={item}>{item.replaceAll("-", " ")}</option>)}
        </SelectField>
        <SelectField label="Unit system" value={units} onChange={(value) => { setLoading(true); setUnits(value); }}>
          <option value="metric">Metric</option><option value="us-customary">U.S. customary</option>
        </SelectField>
      </div>
      {loading && <div className="library-loading-inline"><LoaderCircle size={18} /> Retrieving verified records…</div>}
      {!loading && !result && <div className="library-explorer-empty"><Ruler size={28} /><h3>Select a complete configuration</h3><p>Choose component, class, nominal pipe size, facing, and unit system.</p></div>}
      {result && !loading && <div className="dimension-result-layout">
        <section className="library-table-panel">
          <div className="library-table-heading"><div><h3>{result.component.name}</h3><p>Class {result.pressureClass} · NPS {result.nps} · {result.facingType.replaceAll("-", " ")}</p></div><SourceReference>{result.source.standard} · {result.source.reference.split(", ").at(-1)}</SourceReference></div>
          <div className="technical-table">
            <div className="technical-table-head"><span>Parameter</span><span>Symbol</span><span>Value</span><span>Unit</span><span /></div>
            {result.fields.map((field) => <div className="technical-table-row" key={field.key}><strong>{field.label}</strong><code>{field.symbol || "—"}</code><span>{field.value}</span><span>{field.unit}</span><button type="button" onClick={() => void copyField(field.label, field.value, field.unit)} aria-label={`Copy ${field.label}`}>{copied === field.label ? <Check size={14} /> : <Copy size={14} />}</button></div>)}
          </div>
          <div className="library-linked-notes"><strong><Info size={15} /> Linked notes</strong>{result.notes.map((note) => <p key={note}>{note}</p>)}</div>
        </section>
        <TechnicalSchematic result={result} />
      </div>}
    </div>
  );
}

function Overview({ catalog, selectedSection }: { catalog: LibraryCatalog; selectedSection: string }) {
  const selected = catalog.sections.find((section) => section.slug === selectedSection);
  if (selected) {
    return <section className="library-section-detail"><div className="library-section-number">{selected.code}</div><p>{selected.category.replaceAll("-", " ")}</p><h2>{selected.title}</h2><div className="library-rule" /><p className="library-section-summary">{selected.summary}</p><SourceReference>{selected.source_reference}</SourceReference><div className="library-guidance"><Info size={18} /><div><strong>Structured reference</strong><p>Use the explorers for verified values and dimensional records linked to this standard section.</p></div></div></section>;
  }
  return <>
    <section className="library-overview-hero"><div><p>Published technical library</p><h2>{catalog.standard.designation}</h2><h3>{catalog.standard.title}</h3><span>{catalog.standard.scope}</span></div><div className="library-standard-seal"><strong>B16.5</strong><span>2017</span><small>Metric / Inch</small></div></section>
    <section className="library-stat-grid"><article><Layers3 size={19} /><span>Sections & appendices</span><strong>{catalog.counts.sections}</strong></article><article><Tags size={19} /><span>Material records</span><strong>{catalog.counts.materials}</strong></article><article><Gauge size={19} /><span>Pressure ratings</span><strong>{catalog.counts.ratings}</strong></article><article><Ruler size={19} /><span>Dimension records</span><strong>{catalog.counts.dimensions}</strong></article></section>
    <section className="library-overview-grid"><article><div className="library-card-icon"><Database size={20} /></div><p>Native technical database</p><h3>Verified knowledge, directly queryable</h3><span>Library data is stored as structured records. Search and explorers never parse or load a source document.</span></article><article><div className="library-card-icon"><Gauge size={20} /></div><p>Pressure ratings</p><h3>Material → class → temperature</h3><span>Retrieve a rating with its material group, restrictions, units, and source traceability.</span></article><article><div className="library-card-icon"><Ruler size={20} /></div><p>Dimensions</p><h3>Component → class → NPS</h3><span>Get component-specific values, linked engineering labels, notes, and an interactive schematic.</span></article></section>
  </>;
}

function MaterialsTable({ catalog }: { catalog: LibraryCatalog }) {
  return <section className="library-table-panel material-library-panel"><div className="library-table-heading"><div><h2>Materials</h2><p>Structured specifications linked to rating groups and restrictions</p></div><SourceReference>{catalog.standard.designation} · Table 1A</SourceReference></div><div className="material-table"><div className="material-table-head"><span>Material</span><span>Group</span><span>Form</span><span>Rating table</span><span>Restrictions</span></div>{catalog.materials.map((material) => <div className="material-table-row" key={material.id}><div><strong>{material.name}</strong><small>{material.designation}</small></div><span>{material.group}</span><span>{material.productForm}</span><span>{material.ratingTable}</span><span>{material.restrictions.join(" ") || "See linked notes"}</span></div>)}</div></section>;
}

export function DigitalLibrary() {
  const [catalog, setCatalog] = useState<LibraryCatalog | null>(null);
  const [view, setView] = useState<LibraryView>("overview");
  const [selectedSection, setSelectedSection] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LibrarySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [dimensionSeed, setDimensionSeed] = useState<SearchTarget | null>(null);
  const [ratingSeed, setRatingSeed] = useState<SearchTarget | null>(null);
  const searchRequestId = useRef(0);

  useEffect(() => {
    void api.library.catalog(STANDARD_CODE).then(setCatalog).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load Regina."));
  }, []);

  useEffect(() => {
    const normalized = query.trim();
    if (normalized.length < 2) return;
    const timer = window.setTimeout(() => {
      const requestId = ++searchRequestId.current;
      void api.library.search(STANDARD_CODE, normalized).then((payload) => {
        if (searchRequestId.current === requestId) setResults(payload.results);
      }).finally(() => {
        if (searchRequestId.current === requestId) setSearching(false);
      });
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  function openSearchResult(result: LibrarySearchResult) {
    setQuery(""); setResults([]);
    if (result.target.explorer === "ratings") { setRatingSeed(result.target); setView("ratings"); return; }
    if (result.target.explorer === "dimensions") { setDimensionSeed(result.target); setView("dimensions"); return; }
    if (result.target.section) { setSelectedSection(String(result.target.section)); setView("overview"); }
  }

  if (error) return <section className="panel library-error"><AlertTriangle size={24} /><h1>Regina unavailable</h1><p>{error}</p></section>;
  if (!catalog) return <div className="library-page-loading"><LoaderCircle size={24} /><strong>Opening Regina...</strong></div>;

  const sectionGroups = [
    { label: "Standard", sections: catalog.sections.filter((item) => item.category === "section") },
    { label: "Mandatory appendices", sections: catalog.sections.filter((item) => item.category === "mandatory-appendix") },
    { label: "Nonmandatory appendices", sections: catalog.sections.filter((item) => item.category === "nonmandatory-appendix") },
  ];

  return <div className="digital-library-page">
    <header className="library-page-header"><div><span className="library-kicker"><BookMarked size={14} /> Regina verified knowledge</span><h1>Regina</h1><p>Digital technical library for structured engineering data.</p></div><div className="library-search-wrap"><Search size={18} /><input value={query} onChange={(event) => { const value = event.target.value; setQuery(value); setSearching(value.trim().length >= 2); if (value.trim().length < 2) setResults([]); }} placeholder="Search F316L, Class 600, Welding Neck, NPS 12…" aria-label="Search Regina technical library" />{searching && <LoaderCircle className="library-search-spinner" size={16} />}{query.trim().length >= 2 && <div className="library-search-results">{results.map((result, index) => <button type="button" key={`${result.type}-${result.title}-${index}`} onClick={() => openSearchResult(result)}><span className={`library-result-type result-${result.type.replaceAll(" ", "-")}`}>{result.type}</span><span><strong>{result.title}</strong><small>{result.subtitle}</small></span><ChevronRight size={15} /></button>)}{!searching && results.length === 0 && <p>No structured records match “{query.trim()}”.</p>}</div>}</div></header>
    <div className="library-workspace">
      <aside className="library-sidebar"><div className="library-sidebar-standard"><span>ASME</span><div><strong>B16.5</strong><small>2017 edition</small></div></div><nav aria-label="Regina technical library navigation"><button type="button" className={view === "overview" && !selectedSection ? "active" : ""} onClick={() => { setView("overview"); setSelectedSection(""); }}><BookMarked size={16} /> Overview</button><button type="button" className={view === "ratings" ? "active" : ""} onClick={() => setView("ratings")}><Gauge size={16} /> Pressure ratings</button><button type="button" className={view === "dimensions" ? "active" : ""} onClick={() => setView("dimensions")}><Ruler size={16} /> Dimensions</button><button type="button" className={view === "materials" ? "active" : ""} onClick={() => setView("materials")}><Tags size={16} /> Materials</button>{sectionGroups.map((group) => <div className="library-nav-group" key={group.label}><p>{group.label}</p>{group.sections.map((section) => <button type="button" className={selectedSection === section.slug && view === "overview" ? "active" : ""} key={section.slug} onClick={() => { setSelectedSection(section.slug); setView("overview"); }}><span>{section.code}</span>{section.title}</button>)}</div>)}</nav></aside>
      <main className="library-content">{view === "overview" && <Overview catalog={catalog} selectedSection={selectedSection} />}{view === "ratings" && <RatingExplorer key={JSON.stringify(ratingSeed)} seed={ratingSeed} />}{view === "dimensions" && <DimensionExplorer key={JSON.stringify(dimensionSeed)} seed={dimensionSeed} />}{view === "materials" && <MaterialsTable catalog={catalog} />}</main>
    </div>
  </div>;
}
