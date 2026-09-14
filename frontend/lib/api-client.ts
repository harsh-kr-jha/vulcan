import type { DashboardFilters, ImportInspection, ImportPreview, ImportValidation, WorkspacePayload } from "./factory-domain";

const API_ROOT = "/api/backend/api";

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

let csrfToken: string | null = null;
export async function getCsrfToken(force = false): Promise<string> {
  if (csrfToken && !force) return csrfToken;
  try {
    const res = await fetch(`${API_ROOT}/auth/csrf/`, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.csrfToken) {
        csrfToken = data.csrfToken;
        return csrfToken as string;
      }
    }
  } catch {
    // fallback
  }
  return "";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : null;
    const detail = payload && typeof payload === "object" && "detail" in payload
      ? String(payload.detail)
      : null;
    const fieldError = payload && typeof payload === "object"
      ? Object.values(payload).flat().find((value) => typeof value === "string")
      : null;
    throw new Error(detail ?? fieldError ?? `Django could not complete this request (${response.status}).`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function filterQuery(filters: DashboardFilters) {
  return new URLSearchParams({ factory: filters.factoryId, from: filters.from, to: filters.to, line: filters.line, machine: filters.machine, sku: filters.sku, shift: filters.shift }).toString();
}

export const api = {
  workspace: (filters: DashboardFilters) => request<WorkspacePayload>(`/workspace/?${filterQuery(filters)}`),
  createFactory: (data: object) => request("/factories/", { method: "POST", body: JSON.stringify(data) }),
  updateFactory: (id: string, data: object) => request(`/factories/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  updateConfiguration: (factory: string, data: object) => request<WorkspacePayload>(`/workspace/configuration/?factory=${factory}`, { method: "PATCH", body: JSON.stringify(data) }),
  createMaster: (factory: string, data: object) => request(`/factory-masters/?factory=${factory}`, { method: "POST", body: JSON.stringify({ ...data, factory }) }),
  updateMaster: (factory: string, id: string, data: object) => request(`/factory-masters/${id}/?factory=${factory}`, { method: "PATCH", body: JSON.stringify(data) }),
  removeMaster: (factory: string, id: string) => request(`/factory-masters/${id}/?factory=${factory}`, { method: "DELETE" }),
  inspectImport: async (factory: string, datasetType: string, file: File, process?: string) => { const body = new FormData(); body.set("factory", factory); body.set("datasetType", datasetType); body.set("file", file); if (process) body.set("process", process); return request<ImportInspection>("/imports/inspect/", { method: "POST", body }); },
  validateImport: (id: string, mapping: Record<string, string>) => request<ImportValidation>(`/imports/${id}/validate/`, { method: "POST", body: JSON.stringify({ mapping }) }),
  previewImport: (id: string) => request<ImportPreview>(`/imports/${id}/preview/`),
  editImport: (id: string) => request<ImportInspection>(`/imports/${id}/edit/`),
  deleteImport: (id: string) => request<void>(`/imports/${id}/delete/`, { method: "DELETE" }),
  commitImport: (id: string) => request(`/imports/${id}/commit/`, { method: "POST", body: "{}" }),
  cancelImport: (id: string) => request(`/imports/${id}/cancel/`, { method: "POST", body: "{}" }),
  setAlertStatus: (factory: string, id: string, status: string) => request(`/workspace/configuration/?factory=${factory}`, { method: "PATCH", body: JSON.stringify({ alertStatus: { id, status } }) }),
  createAction: (factory: string, alertId: string, title: string, owner?: string) => request("/workspace/actions/", { method: "POST", body: JSON.stringify({ factory, alertId, title, owner }) }),
  toggleAction: (factory: string, id: string) => request(`/workspace/actions/${id}/`, { method: "PATCH", body: JSON.stringify({ factory }) }),
  ask: (factory: string, filters: DashboardFilters, question: string) => request<{ answer: string; reasoning: string; evidence: string[] }>("/workspace/ask/", { method: "POST", body: JSON.stringify({ factory, filters, question }) }),
  twinFeed: (factoryId: string) => request<import("./factory-domain").TwinFeedPayload>(`/spatial/feed/?factory=${factoryId}`),
  getInventoryChanges: (layoutId: string) => request<import("./factory-domain").TwinFeedInventory["changes"]>(`/spatial/inventory/${layoutId}/changes/`),
  getDispatchEvents: (layoutId: string) => request<import("./factory-domain").TwinFeedDispatch["events"]>(`/spatial/dispatch/${layoutId}/events/`),
};
