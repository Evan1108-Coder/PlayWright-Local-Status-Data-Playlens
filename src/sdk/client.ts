import type { AppState, SearchResult } from "../data/types";
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

export type { AppState, SearchResult, StoredSessionSummary };
