"use client";

import { ArrowRight, BookOpen, ChevronDown, Database, FileQuestion, Search, Settings2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const guides = [
  {
    id: "farm",
    title: "Configure a mushroom farm",
    summary: "Create the cultivation structure that imported rows map to.",
    steps: [
      "Create or select a farm from the sidebar.",
      "Record its growing area, harvest capacity and operating units.",
      "Add each farm wing, then define cultivation stages in flow order.",
      "Add growing rooms and farm assets, then associate each with a stage.",
      "Add mushroom grades, materials, suppliers, observation rounds and reason codes.",
    ],
    action: { href: "/settings", label: "Open farm setup" },
  },
  {
    id: "twin",
    title: "Build the Farm Twin",
    summary: "Connect the crop-stage flow to the latest room observations.",
    steps: [
      "Configure farm wings, cultivation stages, and spatial machine assets.",
      "Open Mushroom Factory Twin to lay out rooms, machinery, and sensor zones.",
      "Scan QR codes attached to machines to record telemetry and environmental readings.",
      "Review stage yield, cycle time, downtime, and live climate status.",
    ],
    action: { href: "/digital-twin", label: "Open Mushroom Factory Twin" },
  },
  {
    id: "import",
    title: "Live QR and data stream",
    summary: "Record machine observations, stock movements, and dispatch via QR codes.",
    steps: [
      "Access the machine or asset via its attached QR code.",
      "Submit telemetry readings, batch stage transitions, and downtime events.",
      "Track materials inventory issues, receipts, and returns.",
      "Log dispatch shipments and track product fulfilment.",
    ],
    action: { href: "/data", label: "Open Live Data" },
  },
  {
    id: "rules",
    title: "Set rules and targets",
    summary: "Define farm-specific thresholds for alerts and crop review.",
    steps: [
      "Set biological efficiency, harvest-attainment and saleable-yield targets.",
      "Choose climate, contamination, water and room-downtime thresholds.",
      "Set minimum stock cover and supplier performance expectations.",
      "Save once; Django applies the rule set to the selected farm.",
    ],
    action: { href: "/rules", label: "Open rules & targets" },
  },
  {
    id: "methodology",
    title: "Understand every KPI",
    summary: "See inputs, formulae, assumptions and the current calculated result.",
    steps: [
      "Start with cultivation, harvest, environment, quality, supply or loss.",
      "Read the source fields from left to right through the formula.",
      "Compare the current result with its configured target where applicable.",
      "Use the data lineage page to inspect the approved source rows.",
    ],
    action: { href: "/methodology", label: "Open KPI methodology" },
  },
];

const faqs = [
  { question: "Where is my operational data stored?", answer: "Approved sources, mappings, validation results and standardized rows are stored in Django. The frontend does not use browser storage as an operational database.", tags: "database browser storage django" },
  { question: "Can I ignore columns from a supplier or mushroom factory sheet?", answer: "Yes. During mapping, select “Do not import this column” for optional fields. Every required standard field must still be mapped before validation can pass.", tags: "mapping omit columns supplier" },
  { question: "What happens to invalid rows?", answer: "They remain preserved with the source and validation evidence but are not added to standardized operational records. The review screen explains the mismatch and suggested correction.", tags: "invalid rejected validation rows" },
  { question: "Why is a dashboard or analysis tab hidden?", answer: "Musroom hides analyses that have no supporting approved data. Upload the relevant sheet and use a date range that contains its crop records.", tags: "dashboard hidden no data" },
  { question: "Why does Home say my data is stale?", answer: "The latest approved operational date is older than that dataset’s freshness window. Use the Refresh button in the notice to open the correct importer directly.", tags: "stale refresh home" },
  { question: "Are rules shared between mushroom factories?", answer: "No. Rules and KPI targets belong to the selected mushroom factory. Switching mushroom factories loads that mushroom factory’s saved configuration and records.", tags: "rules targets factory" },
  { question: "How is the supplier score calculated?", answer: "It combines delivery timing (60 points), delivered quantity (25), accepted quality (10), and agreed terms (5). Late days reduce timing points by 10 per day.", tags: "supplier score delivery formula" },
  { question: "How do I create and show a custom KPI?", answer: "Open Data visualisation, select Add custom KPI, choose two approved aggregate variables and an operation, then save. Use Add to Home on the saved KPI card to pin its Django-calculated result to the command centre.", tags: "custom kpi formula home visualisation" },
  { question: "Can I preview an uploaded CSV without downloading it?", answer: "Yes. On Data upload, click Preview beside a source. Musroom retrieves up to 50 preserved original rows from Django and displays their source headers.", tags: "csv xlsx preview source rows" },
  { question: "Why does each stage have its own observation sheet?", answer: "A sheet is assigned to one configured crop stage, so Django can attach its immutable stage code even when the source omits it. Approved rows drive that stage in the Farm Twin.", tags: "stage sheet farm twin mapping code" },
  { question: "Is the Farm Twin a live sensor feed?", answer: "No. It shows the newest approved room-observation sheet on or before the selected end date. Older reports are marked stale rather than presented as live data.", tags: "farm twin live latest stale room state" },
  { question: "Which file formats can I upload?", answer: "The importer accepts CSV and XLSX files up to 10 MB. Downloadable templates show the standard columns and a valid example row.", tags: "csv xlsx template size" },
];

export function SetupHelp() {
  const [query, setQuery] = useState("");
  const [activeGuide, setActiveGuide] = useState(guides[0].id);
  const normalized = query.trim().toLowerCase();
  const matchingFaqs = useMemo(() => faqs.filter((faq) => !normalized || `${faq.question} ${faq.answer} ${faq.tags}`.toLowerCase().includes(normalized)), [normalized]);
  const guide = guides.find((item) => item.id === activeGuide) ?? guides[0];

  return (
    <>
      <header className="page-header help-page-header">
        <div><h1 className="typography-display">Find the answer. <span>Keep growing.</span></h1><p className="page-subtitle typography-body">Practical guides for the complete mushroom-farm data workflow.</p></div>
      </header>
      <label className="help-search panel"><Search size={18} /><span className="sr-only">Search help</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search mapping, stale data, suppliers, rules…" />{query && <button type="button" onClick={() => setQuery("")}>Clear</button>}</label>
      <section className="help-quick-grid">
        <Link className="panel" href="/settings"><Settings2 size={18} /><span><strong>Configure farm</strong><small>Stages, rooms, rounds and reasons</small></span><ArrowRight size={14} /></Link>
        <Link className="panel" href="/data"><Database size={18} /><span><strong>Live Data Stream</strong><small>QR entries, stock, and dispatch</small></span><ArrowRight size={14} /></Link>
        <Link className="panel" href="/methodology"><BookOpen size={18} /><span><strong>Review calculations</strong><small>Inputs, formulae and results</small></span><ArrowRight size={14} /></Link>
      </section>
      {!normalized && <section className="help-docs-layout">
        <aside className="panel help-doc-nav"><div><BookOpen size={16} /><strong>Setup guides</strong></div>{guides.map((item, index) => <button className={activeGuide === item.id ? "active" : ""} key={item.id} onClick={() => setActiveGuide(item.id)}><span>{String(index + 1).padStart(2, "0")}</span>{item.title}<ArrowRight size={12} /></button>)}</aside>
        <article className="panel help-guide"><h2 className="typography-headline">{guide.title}</h2><p className="typography-body">{guide.summary}</p><ol>{guide.steps.map((step) => <li key={step}><span>{guide.steps.indexOf(step) + 1}</span><p>{step}</p></li>)}</ol><Link className="button button-primary" href={guide.action.href}>{guide.action.label} <ArrowRight size={13} /></Link></article>
      </section>}
      <section className="panel faq-section">
        <header><div><FileQuestion size={18} /><span><h2 className="typography-headline">Frequently asked questions</h2><p>{matchingFaqs.length} {matchingFaqs.length === 1 ? "answer" : "answers"}{normalized ? " matching your search" : ""}</p></span></div></header>
        <div className="faq-list">{matchingFaqs.map((faq) => <details key={faq.question}><summary><span>{faq.question}</span><ChevronDown size={15} /></summary><p>{faq.answer}</p></details>)}{!matchingFaqs.length && <div className="help-no-results"><Search size={22} /><strong>No matching documentation</strong><span>Try a simpler term such as “mapping”, “supplier” or “stale”.</span></div>}</div>
      </section>
    </>
  );
}
