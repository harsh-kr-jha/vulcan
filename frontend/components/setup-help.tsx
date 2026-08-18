"use client";

import { ArrowRight, BookOpen, ChevronDown, FileQuestion, Search, Settings2, UploadCloud } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { usePlatform } from "@/lib/variant";

const mushroomGuides = [
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
      "Open Cultivation Flow and confirm every crop stage has a unique sequence.",
      "Associate each room and farm asset with the stage it supports.",
      "From Farm Twin, choose a stage and add its CSV or XLSX room-observation sheet.",
      "Select a stage to review its latest crop state, climate and connected rooms.",
    ],
    action: { href: "/digital-twin", label: "Open Farm Twin" },
  },
  {
    id: "imports",
    title: "Import operational sheets",
    summary: "Inspect, map, validate and approve data without storing it in the browser.",
    steps: [
      "Choose the sheet type and download its standard template if needed.",
      "Upload CSV or XLSX. Django stores the source and suggests column mappings.",
      "Map required columns; set unwanted optional columns to Do not import.",
      "Review mismatch directions, then import only valid rows.",
    ],
    action: { href: "/uploads", label: "Open data upload" },
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

const sharedFaqs = [
  { question: "Where is my operational data stored?", answer: "Approved sources, mappings, validation results and standardized rows are stored in Django. The frontend does not use browser storage as an operational database.", tags: "database browser storage django" },
  { question: "Can I ignore columns from a supplier or factory sheet?", answer: "Yes. During mapping, select “Do not import this column” for optional fields. Every required standard field must still be mapped before validation can pass.", tags: "mapping omit columns supplier" },
  { question: "What happens to invalid rows?", answer: "They remain preserved with the source and validation evidence but are not added to standardized operational records. The review screen explains the mismatch and suggested correction.", tags: "invalid rejected validation rows" },
  { question: "Why is a dashboard or analysis tab hidden?", answer: "Vulcan hides analyses that have no supporting approved data. Upload the relevant sheet and use a date range that contains its crop records.", tags: "dashboard hidden no data" },
  { question: "Why does Home say my data is stale?", answer: "The latest approved operational date is older than that dataset’s freshness window. Use the Refresh button in the notice to open the correct importer directly.", tags: "stale refresh home" },
  { question: "Are rules shared between factories?", answer: "No. Rules and KPI targets belong to the selected factory. Switching factories loads that factory’s saved configuration and records.", tags: "rules targets factory" },
  { question: "How is the supplier score calculated?", answer: "It combines delivery timing (60 points), delivered quantity (25), accepted quality (10), and agreed terms (5). Late days reduce timing points by 10 per day.", tags: "supplier score delivery formula" },
  { question: "How do I create and show a custom KPI?", answer: "Open Data visualisation, select Add custom KPI, choose two approved aggregate variables and an operation, then save. Use Add to Home on the saved KPI card to pin its Django-calculated result to the command centre.", tags: "custom kpi formula home visualisation" },
  { question: "Can I preview an uploaded CSV without downloading it?", answer: "Yes. On Data upload, click Preview beside a source. Vulcan retrieves up to 50 preserved original rows from Django and displays their source headers.", tags: "csv xlsx preview source rows" },
  { question: "Why does each stage have its own observation sheet?", answer: "A sheet is assigned to one configured crop stage, so Django can attach its immutable stage code even when the source omits it. Approved rows drive that stage in the Farm Twin.", tags: "stage sheet farm twin mapping code" },
  { question: "Is the Farm Twin a live sensor feed?", answer: "No. It shows the newest approved room-observation sheet on or before the selected end date. Older reports are marked stale rather than presented as live data.", tags: "farm twin live latest stale room state" },
  { question: "Which file formats can I upload?", answer: "The importer accepts CSV and XLSX files up to 10 MB. Downloadable templates show the standard columns and a valid example row.", tags: "csv xlsx template size" },
];

const automotiveGuides = [
  { id: "factory", title: "Configure an automotive factory", summary: "Create the manufacturing structure that imported rows map to.", steps: ["Create or select a factory from the sidebar.", "Record its production capacity, operating units and timezone.", "Add each production line, then define manufacturing processes in flow order.", "Add machines and assets, then associate each with a process.", "Add products, materials, suppliers, shifts and reason codes."], action: { href: "/settings", label: "Open factory setup" } },
  { id: "twin", title: "Build the Factory Twin", summary: "Connect the production flow to the latest approved process runs.", steps: ["Open Production Flow and confirm every process has a unique sequence.", "Associate each machine and asset with the process it supports.", "From Factory Twin, choose a process and add its CSV or XLSX process-run sheet.", "Select a process to review its latest output, condition and connected machines."], action: { href: "/digital-twin", label: "Open Factory Twin" } },
  mushroomGuides[2],
  { id: "rules", title: "Set rules and targets", summary: "Define factory-specific thresholds for alerts and operational review.", steps: ["Set OEE, availability, performance, quality and plan-attainment targets.", "Choose rejection-rate and machine-downtime thresholds.", "Set minimum stock cover and supplier performance expectations.", "Save once; Django applies the rule set to the selected factory."], action: { href: "/rules", label: "Open rules & targets" } },
  { id: "methodology", title: "Understand every KPI", summary: "See inputs, formulae, assumptions and the current calculated result.", steps: ["Start with OEE, production, quality, supply, loss or governance.", "Read the source fields from left to right through the formula.", "Compare the current result with its configured target where applicable.", "Use source lineage to inspect the approved records."], action: { href: "/methodology", label: "Open KPI methodology" } },
];

const automotiveFaqs = sharedFaqs.map((faq) => {
  if (faq.question === "Why is a dashboard or analysis tab hidden?") return { ...faq, answer: "Vulcan hides analyses that have no supporting approved data. Upload the relevant sheet and use a date range that contains its production records.", tags: "dashboard hidden no data production" };
  if (faq.question === "Why does each stage have its own observation sheet?") return { question: "Why does each process have its own run sheet?", answer: "A sheet is assigned to one configured process, so Django can attach its immutable process code even when the source omits it. Approved rows drive that process in the Factory Twin.", tags: "process sheet factory twin mapping code" };
  if (faq.question === "Is the Farm Twin a live sensor feed?") return { question: "Is the Factory Twin a live sensor feed?", answer: "No. It shows the newest approved process-run sheet on or before the selected end date. Older reports are marked stale rather than presented as live data.", tags: "factory twin live latest stale machine state" };
  return faq;
});

export function SetupHelp() {
  const variant = usePlatform();
  const mushroomMode = false;
  const guides = mushroomMode ? mushroomGuides : automotiveGuides;
  const faqs = mushroomMode ? sharedFaqs : automotiveFaqs;
  const [query, setQuery] = useState("");
  const [activeGuide, setActiveGuide] = useState(guides[0].id);
  const normalized = query.trim().toLowerCase();
  const matchingFaqs = faqs.filter((faq) => !normalized || `${faq.question} ${faq.answer} ${faq.tags}`.toLowerCase().includes(normalized));
  const guide = guides.find((item) => item.id === activeGuide) ?? guides[0];

  return (
    <>
      <header className="page-header help-page-header">
        <div><p className="eyebrow">Help · product documentation</p><h1>Find the answer. <span>{mushroomMode ? "Keep growing." : "Keep producing."}</span></h1><p className="page-subtitle">Practical guides for the complete {mushroomMode ? "mushroom-farm" : "automotive-factory"} data workflow.</p></div>
      </header>
      <label className="help-search panel"><Search size={18} /><span className="sr-only">Search help</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search mapping, stale data, suppliers, rules…" />{query && <button type="button" onClick={() => setQuery("")}>Clear</button>}</label>
      <section className="help-quick-grid">
        <Link className="panel" href="/settings"><Settings2 size={18} /><span><strong>Configure {variant.terminology.siteSingular}</strong><small>{mushroomMode ? "Stages, rooms, rounds and reasons" : "Processes, lines, machines and reasons"}</small></span><ArrowRight size={14} /></Link>
        <Link className="panel" href="/uploads"><UploadCloud size={18} /><span><strong>Add {variant.terminology.siteSingular} data</strong><small>Inspect and validate a sheet</small></span><ArrowRight size={14} /></Link>
        <Link className="panel" href="/methodology"><BookOpen size={18} /><span><strong>Review calculations</strong><small>Inputs, formulae and results</small></span><ArrowRight size={14} /></Link>
      </section>
      {!normalized && <section className="help-docs-layout">
        <aside className="panel help-doc-nav"><div><BookOpen size={16} /><strong>Setup guides</strong></div>{guides.map((item, index) => <button className={activeGuide === item.id ? "active" : ""} key={item.id} onClick={() => setActiveGuide(item.id)}><span>{String(index + 1).padStart(2, "0")}</span>{item.title}<ArrowRight size={12} /></button>)}</aside>
        <article className="panel help-guide"><p className="eyebrow">Step-by-step</p><h2>{guide.title}</h2><p>{guide.summary}</p><ol>{guide.steps.map((step) => <li key={step}><span>{guide.steps.indexOf(step) + 1}</span><p>{step}</p></li>)}</ol><Link className="button button-primary" href={guide.action.href}>{guide.action.label} <ArrowRight size={13} /></Link></article>
      </section>}
      <section className="panel faq-section">
        <header><div><FileQuestion size={18} /><span><h2>Frequently asked questions</h2><p>{matchingFaqs.length} {matchingFaqs.length === 1 ? "answer" : "answers"}{normalized ? " matching your search" : ""}</p></span></div></header>
        <div className="faq-list">{matchingFaqs.map((faq) => <details key={faq.question}><summary><span>{faq.question}</span><ChevronDown size={15} /></summary><p>{faq.answer}</p></details>)}{!matchingFaqs.length && <div className="help-no-results"><Search size={22} /><strong>No matching documentation</strong><span>Try a simpler term such as “mapping”, “supplier” or “stale”.</span></div>}</div>
      </section>
    </>
  );
}
