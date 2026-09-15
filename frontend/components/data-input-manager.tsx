"use client";

import { useState } from "react";
import { DataStreamsManager } from "@/components/data-streams-manager";
import { MachineDataManager } from "@/components/machine-data-manager";
import { UploadManager } from "@/components/upload-manager";

type DataInputTab = "manage" | "files" | "streams";

export function DataInputManager() {
  const [tab, setTab] = useState<DataInputTab>("manage");

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Factory data workspace</p>
          <h1>
            Manage data. <span>From source to machine cycle.</span>
          </h1>
          <p className="page-subtitle">
            Inspect machine history, control live streams, preserve source lineage, and export
            reviewed records.
          </p>
        </div>
      </header>

      <div className="mb-5 flex gap-2" role="tablist" aria-label="Data input type">
        <button
          className={`button ${tab === "manage" ? "button-primary" : "button-secondary"}`}
          role="tab"
          aria-selected={tab === "manage"}
          onClick={() => setTab("manage")}
        >
          Data management
        </button>
        <button
          className={`button ${tab === "files" ? "button-primary" : "button-secondary"}`}
          role="tab"
          aria-selected={tab === "files"}
          onClick={() => setTab("files")}
        >
          Source files
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

      {tab === "manage" ? <MachineDataManager /> : tab === "streams" ? (
        <DataStreamsManager />
      ) : (
        <div className="[&>.page-header]:hidden">
          <UploadManager />
        </div>
      )}
    </>
  );
}
