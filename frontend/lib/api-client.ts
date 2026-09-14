import type { DashboardFilters, FactoryMasterImportInspection, ImportInspection, ImportPreview, ImportValidation, WorkspacePayload } from "./factory-domain";
import type {
  DataInputStream,
  MachineCycleHistory,
  MachineCycleOutcome,
} from "./data-stream-types";

const API_ROOT = "/api/backend/api";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export interface AuthFactory {
  id: string;
  name: string;
  code?: string;
}

export interface AuthUser {
  id: number | string;
  email: string;
  name: string;
  role?: string;
  tenant?: { id: string; name: string };
  factories?: AuthFactory[];
}

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
let csrfRequest: Promise<string> | null = null;

function firstMessage(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = firstMessage(item);
      if (message) return message;
    }
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.detail === "string") return record.detail;
    for (const item of Object.values(record)) {
      const message = firstMessage(item);
      if (message) return message;
    }
  }
  return null;
}

async function parseResponse(response: Response): Promise<unknown> {
  if (response.status === 204) return undefined;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json().catch(() => null);
  }
  return response.text().catch(() => "");
}

export async function getCsrfToken(force = false): Promise<string> {
  if (csrfToken && !force) return csrfToken;
  if (csrfRequest && !force) return csrfRequest;

  csrfRequest = (async () => {
    const response = await fetch(`${API_ROOT}/auth/csrf/`, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      throw new ApiError(
        firstMessage(payload) ?? `Django could not initialize a secure session (${response.status}).`,
        response.status,
        payload,
      );
    }
    const token = payload && typeof payload === "object"
      ? (payload as Record<string, unknown>).csrfToken
      : null;
    if (typeof token !== "string" || token.length < 8) {
      throw new ApiError("Django returned an invalid CSRF token.", 500, payload);
    }
    csrfToken = token;
    return token;
  })();

  try {
    return await csrfRequest;
  } finally {
    csrfRequest = null;
  }
}

async function request<T>(path: string, init: RequestInit = {}, allowCsrfRetry = true): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (!(init.body instanceof FormData) && init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (!SAFE_METHODS.has(method)) {
    headers.set("X-CSRFToken", await getCsrfToken());
  }

  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    method,
    headers,
    credentials: "same-origin",
    cache: "no-store",
  });
  const payload = await parseResponse(response);
  if (!response.ok) {
    const message = firstMessage(payload);
    if (
      allowCsrfRetry
      && !SAFE_METHODS.has(method)
      && response.status === 403
      && message?.toLocaleLowerCase("en-US").includes("csrf")
    ) {
      csrfToken = null;
      await getCsrfToken(true);
      return request<T>(path, init, false);
    }
    throw new ApiError(
      message ?? `Django could not complete this request (${response.status}).`,
      response.status,
      payload,
    );
  }
  return payload as T;
}

function filterQuery(filters: DashboardFilters) {
  return new URLSearchParams({ factory: filters.factoryId, from: filters.from, to: filters.to, line: filters.line, machine: filters.machine, sku: filters.sku, shift: filters.shift }).toString();
}

export const api = {
  auth: {
    csrf: () => getCsrfToken(),
    login: async (email: string, password: string) => {
      const identity = await request<AuthUser | { user: AuthUser }>("/auth/login/", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      // Django rotates the CSRF secret when the session is authenticated.
      // Replace the anonymous masked token before the first protected write.
      csrfToken = null;
      await getCsrfToken(true).catch(() => { csrfToken = null; });
      return identity;
    },
    logout: async () => {
      try {
        return await request<void>("/auth/logout/", { method: "POST", body: "{}" });
      } finally {
        csrfToken = null;
      }
    },
    me: () => request<AuthUser>("/auth/me/"),
  },
  workspace: (filters: DashboardFilters) => request<WorkspacePayload>(`/workspace/?${filterQuery(filters)}`),
  createFactory: (data: object) => request("/factories/", { method: "POST", body: JSON.stringify(data) }),
  updateFactory: (id: string, data: object) => request(`/factories/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  updateConfiguration: (factory: string, data: object) => request<WorkspacePayload>(`/workspace/configuration/?factory=${factory}`, { method: "PATCH", body: JSON.stringify(data) }),
  createMaster: (factory: string, data: object) => request(`/factory-masters/?factory=${factory}`, { method: "POST", body: JSON.stringify({ ...data, factory }) }),
  updateMaster: (factory: string, id: string, data: object) => request(`/factory-masters/${id}/?factory=${factory}`, { method: "PATCH", body: JSON.stringify(data) }),
  removeMaster: (factory: string, id: string) => request(`/factory-masters/${id}/?factory=${factory}`, { method: "DELETE" }),
  inspectFactoryMasters: (factory: string, file: File) => { const body = new FormData(); body.set("factory", factory); body.set("file", file); return request<FactoryMasterImportInspection>("/factory-masters/import/inspect/", { method: "POST", body }); },
  applyFactoryMasters: (factory: string, file: File, expectedChecksum: string) => { const body = new FormData(); body.set("factory", factory); body.set("file", file); body.set("expectedChecksum", expectedChecksum); return request<FactoryMasterImportInspection>("/factory-masters/import/apply/", { method: "POST", body }); },
  inspectImport: async (factory: string, datasetType: string, file: File, process?: string) => { const body = new FormData(); body.set("factory", factory); body.set("datasetType", datasetType); body.set("file", file); if (process) body.set("process", process); return request<ImportInspection>("/imports/inspect/", { method: "POST", body }); },
  validateImport: (id: string, mapping: Record<string, string>) => request<ImportValidation>(`/imports/${id}/validate/`, { method: "POST", body: JSON.stringify({ mapping }) }),
  previewImport: (id: string) => request<ImportPreview>(`/imports/${id}/preview/`),
  editImport: (id: string) => request<ImportInspection>(`/imports/${id}/edit/`),
  deleteImport: (id: string) => request<void>(`/imports/${id}/delete/`, { method: "DELETE" }),
  commitImport: (id: string) => request(`/imports/${id}/commit/`, { method: "POST", body: "{}" }),
  cancelImport: (id: string) => request(`/imports/${id}/cancel/`, { method: "POST", body: "{}" }),
  listDataStreams: async (factory: string) => {
    const payload = await request<DataInputStream[] | { results: DataInputStream[] }>(`/data-streams/?factory=${factory}`);
    return Array.isArray(payload) ? payload : payload.results;
  },
  createDataStream: (data: object) => request<DataInputStream>("/data-streams/", { method: "POST", body: JSON.stringify(data) }),
  updateDataStream: (id: string, data: object) => request<DataInputStream>(`/data-streams/${id}/`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteDataStream: (id: string) => request<void>(`/data-streams/${id}/`, { method: "DELETE" }),
  discoverDataStream: (id: string) => request<{ stream: DataInputStream }>(`/data-streams/${id}/discover/`, { method: "POST", body: "{}" }),
  controlDataStream: (id: string, action: string, data: object) => request<Record<string, unknown>>(`/data-streams/${id}/control/${action}/`, { method: "POST", body: JSON.stringify(data) }),
  acceptDataStreamSchema: (machineId: string) => request<{ status: string; last_error: string }>(`/data-streams/machines/${machineId}/binding/accept-schema/`, { method: "POST", body: "{}" }),
  updateMachineCycleOutcome: (
    machineId: string,
    outcomeId: string,
    effectiveLabel: "good" | "failure",
  ) => request<MachineCycleOutcome>(
    `/data-streams/machines/${machineId}/outcomes/${outcomeId}/`,
    { method: "PATCH", body: JSON.stringify({ effective_label: effectiveLabel }) },
  ),
  listMachineCycles: (machineId: string, cursor?: string | null, limit = 20) => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (cursor) query.set("cursor", cursor);
    return request<{ results: MachineCycleHistory[]; next_cursor: string | null }>(
      `/data-streams/machines/${machineId}/cycles/?${query}`,
    );
  },
  setAlertStatus: (factory: string, id: string, status: string) => request(`/workspace/configuration/?factory=${factory}`, { method: "PATCH", body: JSON.stringify({ alertStatus: { id, status } }) }),
  createAction: (factory: string, alertId: string, title: string, owner?: string) => request("/workspace/actions/", { method: "POST", body: JSON.stringify({ factory, alertId, title, owner }) }),
  toggleAction: (factory: string, id: string) => request(`/workspace/actions/${id}/`, { method: "PATCH", body: JSON.stringify({ factory }) }),
  ask: (factory: string, filters: DashboardFilters, question: string) => request<{ answer: string; reasoning: string; evidence: string[] }>("/workspace/ask/", { method: "POST", body: JSON.stringify({ factory, filters, question }) }),
};
