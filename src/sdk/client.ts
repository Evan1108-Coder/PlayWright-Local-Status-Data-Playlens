import type { AppState, Issue, SearchResult, SettingGroup, SystemMetricSample, Task, TimelineEvent } from "../data/types";
import type { ApiHealth, StoredSessionSummary } from "../lib/apiClient";

export interface PlayLensClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class PlayLensClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: PlayLensClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? "http://127.0.0.1:4174";
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async health(): Promise<ApiHealth> {
    const health = await this.get<ApiHealth>("/api/health");
    return { ...health, ok: health.ok ?? health.status === "ok" };
  }

  async getState(): Promise<AppState> {
    const response = await this.get<AppState | { status: "ok"; state: AppState }>("/api/state");
    return "state" in response ? response.state : response;
  }

  async saveState(state: AppState): Promise<{ ok: boolean }> {
    return this.post<{ ok: boolean }>("/api/state", state);
  }

  async listSessions(): Promise<StoredSessionSummary[]> {
    const response = await this.get<StoredSessionSummary[] | { status: "ok"; sessions: StoredSessionSummary[] }>("/api/sessions");
    return Array.isArray(response) ? response : response.sessions;
  }

  async listTasks(): Promise<Task[]> {
    const response = await this.get<{ status: "ok"; tasks: Task[] }>("/api/tasks");
    return response.tasks;
  }

  async getTask(taskId: string): Promise<Task> {
    const response = await this.get<{ status: "ok"; task: Task }>(`/api/tasks/${encodeURIComponent(taskId)}`);
    return response.task;
  }

  async getSession(sessionId: string): Promise<{ session: AppState["sessions"][number]; events: TimelineEvent[]; issues: Issue[]; metrics: SystemMetricSample[] }> {
    const response = await this.get<{ status: "ok"; session: AppState["sessions"][number]; events: TimelineEvent[]; issues: Issue[]; metrics: SystemMetricSample[] }>(`/api/sessions/${encodeURIComponent(sessionId)}`);
    return {
      session: response.session,
      events: response.events,
      issues: response.issues,
      metrics: response.metrics
    };
  }

  async listEvents(query: { taskId?: string; sessionId?: string; kind?: string; severity?: string; limit?: number } = {}): Promise<TimelineEvent[]> {
    const response = await this.get<{ status: "ok"; events: TimelineEvent[] }>(`/api/events${toQueryString(query)}`);
    return response.events;
  }

  async listIssues(query: { taskId?: string; sessionId?: string } = {}): Promise<Issue[]> {
    const response = await this.get<{ status: "ok"; issues: Issue[] }>(`/api/issues${toQueryString(query)}`);
    return response.issues;
  }

  async listMetrics(query: { taskId?: string; sessionId?: string } = {}): Promise<SystemMetricSample[]> {
    const response = await this.get<{ status: "ok"; metrics: SystemMetricSample[] }>(`/api/metrics${toQueryString(query)}`);
    return response.metrics;
  }

  async getSettings(): Promise<SettingGroup[]> {
    const response = await this.get<{ status: "ok"; settingsGroups: SettingGroup[] }>("/api/settings");
    return response.settingsGroups;
  }

  async updateSetting(settingIdOrPath: string, value: unknown): Promise<AppState> {
    const key = settingIdOrPath.startsWith("setting-") ? "settingId" : "path";
    const response = await this.post<{ status: "ok"; state: AppState }>("/api/settings", { [key]: settingIdOrPath, value });
    return response.state;
  }

  async manifest(): Promise<unknown> {
    return this.get<unknown>("/api/manifest");
  }

  async export(format: "json" | "ndjson" | "markdown"): Promise<string> {
    const response = await this.fetchImpl(`${this.baseUrl}/api/export?format=${format}`);
    if (!response.ok) {
      throw new Error(`PlayLens export failed: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }

  async search(query: string): Promise<SearchResult[]> {
    return this.get<SearchResult[]>(`/api/search?q=${encodeURIComponent(query)}`);
  }

  private async get<T>(path: string): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) {
      throw new Error(`PlayLens API request failed: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      throw new Error(`PlayLens API request failed: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }
}

function toQueryString(query: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

export type { AppState, SearchResult, StoredSessionSummary };
