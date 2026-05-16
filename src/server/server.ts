import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";

(function loadDotEnv() {
  try {
    const envPath = resolve(fileURLToPath(import.meta.url), "../../../.env");
    const lines = readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {}
})();
import type { ApiErrorBody, ExportFormat, HealthResponse, SessionsResponse, StateResponse, StateSaveResponse } from "./apiTypes";
import { createEmptyAppState, createInitialAppState, type PlayLensState } from "../state/appState";
import {
  appendSessionEvent,
  createSession,
  createSessionExport,
  getStoragePaths,
  hydrateStateFromStoredSessions,
  initializeStorage,
  listSessions,
  loadAppStateSnapshot,
  readSessionEvents,
  saveAppStateSnapshot
} from "../storage/sessionStore";

export interface PlayLensServerOptions {
  port?: number;
  host?: string;
  projectRoot?: string;
}

const DEFAULT_PORT = 4174;
const DEFAULT_HOST = "127.0.0.1";

export function createPlayLensServer(options: PlayLensServerOptions = {}): http.Server {
  const storeOptions = { projectRoot: options.projectRoot };

  return http.createServer(async (request, response) => {
    try {
      setCorsHeaders(response);
      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }

      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

      if (request.method === "GET" && url.pathname === "/api/health") {
        await initializeStorage(storeOptions);
        const paths = getStoragePaths(storeOptions);
        const checkedAt = new Date().toISOString();
        sendJson<HealthResponse>(response, 200, {
          ok: true,
          status: "ok",
          service: "playlens-backend",
          storageReady: true,
          storageRoot: paths.sessionsDir,
          version: "0.1.0",
          timestamp: checkedAt,
          checkedAt
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/state") {
        const state = await hydrateStateFromStoredSessions(await loadOrCreateState(storeOptions), storeOptions);
        sendJson<StateResponse>(response, 200, { status: "ok", state });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/state") {
        const state = await readJsonBody<PlayLensState>(request);
        const saved = await saveAppStateSnapshot(state, storeOptions);
        await seedSessionManifestsFromState(state, storeOptions);
        sendJson<StateSaveResponse>(response, 200, { status: "ok", savedAt: saved.savedAt, snapshotPath: saved.snapshotPath });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/sessions") {
        await loadOrCreateState(storeOptions);
        const sessions = await listSessions(storeOptions);
        sendJson<SessionsResponse>(response, 200, { status: "ok", sessions });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/ai/complete") {
        const apiKey = process.env.MINIMAX_API_KEY?.trim();
        if (!apiKey) {
          sendError(response, 503, "ai_unavailable", "MiniMax API key is not configured on the server. Set MINIMAX_API_KEY to enable AI.");
          return;
        }
        const body = await readJsonBody<{ messages: Array<{ role: string; content: string }>; temperature?: number; maxTokens?: number }>(request);
        const model = process.env.MINIMAX_MODEL ?? "minimax-text-01";
        const baseUrl = (process.env.MINIMAX_BASE_URL ?? "https://api.minimax.io/v1").replace(/\/$/, "");
        const upstream = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ model, messages: body.messages, temperature: body.temperature ?? 0.2, max_tokens: body.maxTokens ?? 1200 }),
        });
        if (!upstream.ok) {
          const detail = await upstream.text().catch(() => "");
          sendError(response, upstream.status, "ai_error", `MiniMax: ${upstream.status}${detail ? ` - ${detail.slice(0, 240)}` : ""}`);
          return;
        }
        sendText(response, 200, await upstream.text(), "application/json; charset=utf-8");
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/ai/status") {
        sendJson(response, 200, { configured: Boolean(process.env.MINIMAX_API_KEY?.trim()), model: process.env.MINIMAX_MODEL ?? "minimax-text-01" });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/export") {
        const format = parseExportFormat(url.searchParams.get("format"));
        const state = await loadOrCreateState(storeOptions);
        const result = await createSessionExport(format, state, storeOptions);
        sendText(response, 200, result.content, result.contentType, {
          "Content-Disposition": `attachment; filename="${result.fileName}"`,
          "X-PlayLens-Export-Path": result.filePath
        });
        return;
      }

      sendError(response, 404, "not_found", `Route not found: ${request.method ?? "GET"} ${url.pathname}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown server error";
      sendError(response, 500, "server_error", message);
    }
  });
}

export async function startPlayLensServer(options: PlayLensServerOptions = {}): Promise<http.Server> {
  const server = createPlayLensServer(options);
  const port = options.port ?? Number(process.env.PLAYLENS_API_PORT ?? DEFAULT_PORT);
  const host = options.host ?? process.env.PLAYLENS_API_HOST ?? DEFAULT_HOST;

  await new Promise<void>((resolve) => {
    server.listen(port, host, resolve);
  });

  return server;
}

async function loadOrCreateState(storeOptions: { projectRoot?: string }): Promise<PlayLensState> {
  const existing = await loadAppStateSnapshot(storeOptions);
  if (process.env.PLAYLENS_STORAGE_DIR) {
    return createRecordingBackedState(existing);
  }
  if (existing) return existing;

  if (process.env.PLAYLENS_DEMO_MODE === "1") {
    const state = createInitialAppState();
    await saveAppStateSnapshot(state, storeOptions);
    await seedSessionManifestsFromState(state, storeOptions);
    return state;
  }

  const state = createEmptyAppState();
  await saveAppStateSnapshot(state, storeOptions);
  return state;
}

function createRecordingBackedState(existing: PlayLensState | null): PlayLensState {
  const empty = createEmptyAppState();
  if (!existing) return empty;
  return {
    ...empty,
    settingsGroups: existing.settingsGroups,
    projectScopes: existing.projectScopes,
    auditLog: existing.auditLog,
    aiAgent: existing.aiAgent,
    agent: existing.aiAgent,
    uploadedFiles: existing.uploadedFiles,
    lastUpdatedAt: existing.lastUpdatedAt,
    selectedTaskId: empty.selectedTaskId,
    system: empty.system
  };
}

async function seedSessionManifestsFromState(state: PlayLensState, storeOptions: { projectRoot?: string }): Promise<void> {
  for (const session of state.sessions) {
    await createSession(session, storeOptions);
    const existingEvents = await readSessionEvents(session.id, storeOptions);
    if (existingEvents.length > 0) continue;
    for (const event of state.events.filter((candidate) => candidate.sessionId === session.id)) {
      await appendSessionEvent(session.id, event, storeOptions);
    }
  }
}

function parseExportFormat(value: string | null): ExportFormat {
  if (value === "json" || value === "ndjson" || value === "markdown") return value;
  throw new Error(`Unsupported export format: ${value ?? "missing"}`);
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    throw new Error("Request body is required.");
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function sendJson<T>(response: ServerResponse, statusCode: number, body: T): void {
  sendText(response, statusCode, JSON.stringify(body, null, 2), "application/json; charset=utf-8");
}

function sendText(
  response: ServerResponse,
  statusCode: number,
  body: string,
  contentType: string,
  extraHeaders: Record<string, string> = {}
): void {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  response.end(body);
}

function sendError(response: ServerResponse, statusCode: number, code: string, message: string): void {
  const body: ApiErrorBody = { status: "error", error: { code, message } };
  sendJson(response, statusCode, body);
}

function setCorsHeaders(response: ServerResponse): void {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectRun) {
  startPlayLensServer()
    .then((server) => {
      const address = server.address();
      const label = typeof address === "object" && address ? `${address.address}:${address.port}` : "unknown";
      console.log(`PlayLens backend listening on ${label}`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
