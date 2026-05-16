import type { PlayLensState } from "../state/appState";

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
  command?: string;
  cwd?: string;
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

export async function getStoredState(): Promise<ApiClientResult<PlayLensState>> {
  const result = await getJson<PlayLensState | { status: "ok"; state: PlayLensState }>("/api/state?eventLimit=140&compactRuntimeMarkers=1");
  if (!result.ok || !result.data) return result as ApiClientResult<PlayLensState>;
  if ("state" in result.data) return { ok: true, data: result.data.state };
  return { ok: true, data: result.data };
}

export async function saveStoredState(state: PlayLensState): Promise<ApiClientResult<{ savedAt: string; snapshotPath: string }>> {
  return postJson<{ status: "ok"; savedAt: string; snapshotPath: string }, { savedAt: string; snapshotPath: string }>("/api/state", state, (data) => ({
    savedAt: data.savedAt,
    snapshotPath: data.snapshotPath
  }));
}

export async function clearAppMemory(): Promise<ApiClientResult<{ clearedAt: string }>> {
  return postJson<{ status: "ok"; clearedAt: string }, { clearedAt: string }>("/api/memory/clear", { confirm: true }, (data) => ({
    clearedAt: data.clearedAt
  }));
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

export function getArtifactUrl(sessionId: string, artifactPath: string): string {
  const params = new URLSearchParams({ sessionId, path: artifactPath });
  return `${API_BASE}/api/artifact?${params.toString()}`;
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

async function postJson<T, R = T>(path: string, body: unknown, map?: (data: T) => R): Promise<ApiClientResult<R>> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      return { ok: false, error: `${response.status} ${response.statusText}` };
    }
    const data = (await response.json()) as T;
    return { ok: true, data: map ? map(data) : (data as unknown as R) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Backend is not reachable"
    };
  }
}
