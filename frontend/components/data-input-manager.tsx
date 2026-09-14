"use client";

import { useState } from "react";
import { DataStreamsManager } from "@/components/data-streams-manager";
import { UploadManager } from "@/components/upload-manager";

type DataInputTab = "files" | "streams";

export function DataInputManager() {
  const [tab, setTab] = useState<DataInputTab>("files");

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Source-connected ingestion</p>
          <h1>
            Connect data. <span>Keep machines independent.</span>
          </h1>
          <p className="page-subtitle">
            Register live gateways or import files while Django preserves credentials, lineage,
            and routing.
          </p>
        </div>
      </header>

      <div className="mb-5 flex gap-2" role="tablist" aria-label="Data input type">
        <button
          className={`button ${tab === "files" ? "button-primary" : "button-secondary"}`}
          role="tab"
          aria-selected={tab === "files"}
          onClick={() => setTab("files")}
        >
          File uploads
        </button>
        <button
          className={`button ${tab === "streams" ? "button-primary" : "button-secondary"}`}
          role="tab"
          aria-selected={tab === "streams"}
          onClick={() => setTab("streams")}
        >
          Data streams
        </button>
      </div>

      {tab === "streams" ? (
        <DataStreamsManager />
      ) : (
        <div className="[&>.page-header]:hidden">
          <UploadManager />
        </div>
      )}
    </>
  );
}
