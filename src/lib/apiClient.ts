import type { AppState } from "../data/types";

export interface ApiHealth {
  ok: boolean;
  status?: "ok" | "error";
  service: string;
  storageReady?: boolean;
  storageRoot?: string;
  version?: string;
  timestamp?: string;
  checkedAt?: string;
}

export interface StoredSessionSummary {
  id: string;
  taskId?: string;
  title: string;
  status: string;
  eventCount: number;
  issueCount?: number;
  artifactCount?: number;
  startedAt?: string;
  endedAt?: string;
}

export interface ApiClientResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

const API_BASE =
  ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_PLAYLENS_API_BASE) ??
  "http://127.0.0.1:4174";

export async function getApiHealth(): Promise<ApiClientResult<ApiHealth>> {
  const result = await getJson<ApiHealth>("/api/health");
  if (!result.ok || !result.data) return result;
  return { ok: true, data: { ...result.data, ok: result.data.ok ?? result.data.status === "ok" } };
}

export async function getStoredState(): Promise<ApiClientResult<AppState>> {
  const result = await getJson<AppState | { status: "ok"; state: AppState }>("/api/state");
  if (!result.ok || !result.data) return result as ApiClientResult<AppState>;
  if ("state" in result.data) return { ok: true, data: result.data.state };
  return { ok: true, data: result.data };
}

export async function getStoredSessions(): Promise<ApiClientResult<StoredSessionSummary[]>> {
  const result = await getJson<StoredSessionSummary[] | { status: "ok"; sessions: Array<StoredSessionSummary & { issueCount?: number }> }>("/api/sessions");
  if (!result.ok || !result.data) return result as ApiClientResult<StoredSessionSummary[]>;
  if (Array.isArray(result.data)) return { ok: true, data: result.data };
  return {
    ok: true,
    data: result.data.sessions.map((session) => ({
      ...session
    }))
  };
}

export function getExportUrl(format: "json" | "ndjson" | "markdown"): string {
  return `${API_BASE}/api/export?format=${format}`;
}

async function getJson<T>(path: string): Promise<ApiClientResult<T>> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) {
      return { ok: false, error: `${response.status} ${response.statusText}` };
    }
    return { ok: true, data: (await response.json()) as T };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Backend is not reachable"
    };
  }
}
