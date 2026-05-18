import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initProjectScope } from "../recorder/projectScope";
import { ensureCompleteSettingsGroups } from "../settings/settingsCatalog";
import type { ApiErrorBody, ExportFormat, HealthResponse, SessionsResponse, StateResponse, StateSaveResponse } from "./apiTypes";
import { createEmptyAppState, createInitialAppState, searchApp, updateSetting, type PlayLensState } from "../state/appState";
import {
  appendSessionEvent,
  createSession,
  createSessionExport,
  getStoragePaths,
  hydrateStateFromStoredSessions,
  initializeStorage,
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
        const eventLimit = parsePositiveInteger(url.searchParams.get("eventLimit"));
        const compactRuntimeMarkers = url.searchParams.get("compactRuntimeMarkers") === "1";
        const state = await getHydratedState(storeOptions, { eventLimit, compactRuntimeMarkers });
        sendJson<StateResponse>(response, 200, { status: "ok", state });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/state") {
        const state = await readJsonBody<PlayLensState>(request);
        const stateToSave = process.env.PLAYLENS_STORAGE_DIR ? createRecordingBackedState(state) : state;
        const saved = await saveAppStateSnapshot(stateToSave, storeOptions);
        if (!process.env.PLAYLENS_STORAGE_DIR) await seedSessionManifestsFromState(state, storeOptions);
        sendJson<StateSaveResponse>(response, 200, { status: "ok", savedAt: saved.savedAt, snapshotPath: saved.snapshotPath });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/project-scopes") {
        const body = await readJsonBody<{ folderPath?: string }>(request);
        if (!body.folderPath?.trim()) {
          sendError(response, 400, "folder_required", "folderPath is required.");
          return;
        }
        const state = await loadOrCreateState(storeOptions);
        const next = addInitializedProjectScope(state, body.folderPath);
        const saved = await saveAppStateSnapshot(process.env.PLAYLENS_STORAGE_DIR ? createRecordingBackedState(next) : next, storeOptions);
        const hydrated = await getHydratedState(storeOptions, { eventLimit: 140, compactRuntimeMarkers: true });
        sendJson(response, 200, { status: "ok", savedAt: saved.savedAt, state: hydrated });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/memory/clear") {
        const body = await readJsonBody<{ confirm?: boolean }>(request);
        if (body.confirm !== true) {
          sendError(response, 400, "confirmation_required", "Set confirm=true to clear PlayLens memory.");
          return;
        }
        const paths = getStoragePaths(storeOptions);
        await Promise.all([
          fs.rm(paths.stateDir, { recursive: true, force: true }),
          fs.rm(paths.snapshotsDir, { recursive: true, force: true }),
          fs.rm(paths.exportsDir, { recursive: true, force: true }),
          fs.rm(paths.sessionsDir, { recursive: true, force: true })
        ]);
        await initializeStorage(storeOptions);
        const empty = createEmptyAppState();
        await saveAppStateSnapshot(empty, storeOptions);
        sendJson(response, 200, { status: "ok", clearedAt: new Date().toISOString() });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/sessions") {
        const state = await getHydratedState(storeOptions);
        const sessions = state.sessions.map((session) => {
          const task = state.tasks.find((item) => item.id === session.taskId);
          return {
            id: session.id,
            taskId: session.taskId,
            title: session.title,
            status: session.status,
            command: task?.command,
            cwd: task?.cwd,
            browserName: session.browser.name,
            startedAt: session.startedAt,
            endedAt: session.endedAt,
            updatedAt: session.endedAt ?? session.startedAt,
            currentUrl: session.currentUrl,
            eventCount: session.eventIds.length,
            issueCount: session.issueIds.length
          };
        });
        sendJson<SessionsResponse>(response, 200, { status: "ok", sessions });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/manifest") {
        const paths = getStoragePaths(storeOptions);
        sendJson(response, 200, createApiManifest(paths.sessionsDir));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/raw/state") {
        const paths = getStoragePaths(storeOptions);
        sendJson(response, 200, {
          status: "ok",
          state: await getHydratedState(storeOptions),
          savedState: await loadOrCreateState(storeOptions),
          storage: paths,
          fileIndex: await createStorageFileIndex(paths)
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/raw/files/index") {
        sendJson(response, 200, { status: "ok", files: await createStorageFileIndex(getStoragePaths(storeOptions)) });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/raw/sessions") {
        sendJson(response, 200, { status: "ok", sessions: await listRawSessions(getStoragePaths(storeOptions)) });
        return;
      }

      const rawSessionManifestMatch = url.pathname.match(/^\/api\/raw\/sessions\/([^/]+)\/manifest$/);
      if (request.method === "GET" && rawSessionManifestMatch) {
        const manifest = await readRawSessionManifest(getStoragePaths(storeOptions), rawSessionManifestMatch[1]);
        if (!manifest) {
          sendError(response, 404, "session_manifest_not_found", `Raw session manifest not found: ${rawSessionManifestMatch[1]}`);
          return;
        }
        sendJson(response, 200, { status: "ok", manifest });
        return;
      }

      const rawSessionEventsMatch = url.pathname.match(/^\/api\/raw\/sessions\/([^/]+)\/events$/);
      if (request.method === "GET" && rawSessionEventsMatch) {
        sendJson(response, 200, {
          status: "ok",
          events: await readRawSessionEvents(getStoragePaths(storeOptions), rawSessionEventsMatch[1])
        });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/tasks") {
        const state = await getHydratedState(storeOptions);
        sendJson(response, 200, { status: "ok", tasks: state.tasks });
        return;
      }

      const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
      if (request.method === "GET" && taskMatch) {
        const state = await getHydratedState(storeOptions);
        const task = state.tasks.find((item) => item.id === taskMatch[1]);
        if (!task) {
          sendError(response, 404, "task_not_found", `Task not found: ${taskMatch[1]}`);
          return;
        }
        sendJson(response, 200, { status: "ok", task });
        return;
      }

      const sessionArtifactsMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/artifacts$/);
      if (request.method === "GET" && sessionArtifactsMatch) {
        const artifacts = await listArtifactsForSession(getStoragePaths(storeOptions), sessionArtifactsMatch[1]);
        sendJson(response, 200, { status: "ok", artifacts });
        return;
      }

      const sessionMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (request.method === "GET" && sessionMatch) {
        const state = await getHydratedState(storeOptions);
        const session = state.sessions.find((item) => item.id === sessionMatch[1]);
        if (!session) {
          sendError(response, 404, "session_not_found", `Session not found: ${sessionMatch[1]}`);
          return;
        }
        sendJson(response, 200, {
          status: "ok",
          session,
          events: state.events.filter((event) => event.sessionId === session.id),
          issues: state.issues.filter((issue) => issue.sessionId === session.id),
          metrics: state.systemMetrics.filter((metric) => metric.sessionId === session.id)
        });
        return;
      }

      const sessionEventsMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/events$/);
      if (request.method === "GET" && sessionEventsMatch) {
        const state = await getHydratedState(storeOptions);
        const events = applyEventQuery(state.events.filter((event) => event.sessionId === sessionEventsMatch[1]), url);
        sendJson(response, 200, { status: "ok", events });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/artifacts") {
        const sessionId = url.searchParams.get("sessionId");
        const artifacts = sessionId
          ? await listArtifactsForSession(getStoragePaths(storeOptions), sessionId)
          : await listAllArtifacts(getStoragePaths(storeOptions));
        sendJson(response, 200, { status: "ok", artifacts });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/events") {
        const state = await getHydratedState(storeOptions);
        sendJson(response, 200, { status: "ok", events: applyEventQuery(state.events, url) });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/issues") {
        const state = await getHydratedState(storeOptions);
        const taskId = url.searchParams.get("taskId");
        const sessionId = url.searchParams.get("sessionId");
        const issues = state.issues.filter((issue) =>
          (!taskId || issue.taskId === taskId) &&
          (!sessionId || issue.sessionId === sessionId)
        );
        sendJson(response, 200, { status: "ok", issues });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/metrics") {
        const state = await getHydratedState(storeOptions);
        const taskId = url.searchParams.get("taskId");
        const sessionId = url.searchParams.get("sessionId");
        const metrics = state.systemMetrics.filter((metric) =>
          (!taskId || metric.taskId === taskId) &&
          (!sessionId || metric.sessionId === sessionId)
        );
        sendJson(response, 200, { status: "ok", metrics });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/settings") {
        const state = await getHydratedState(storeOptions);
        sendJson(response, 200, { status: "ok", settingsGroups: state.settingsGroups });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/project-scopes") {
        const state = await getHydratedState(storeOptions);
        sendJson(response, 200, { status: "ok", projectScopes: state.projectScopes });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/audit") {
        const state = await getHydratedState(storeOptions);
        sendJson(response, 200, { status: "ok", auditLog: state.auditLog });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/ai/messages") {
        const state = await getHydratedState(storeOptions);
        sendJson(response, 200, { status: "ok", messages: state.aiAgent.messages, agent: state.aiAgent });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/uploads") {
        const state = await getHydratedState(storeOptions);
        sendJson(response, 200, { status: "ok", uploadedFiles: state.uploadedFiles });
        return;
      }

      if (request.method === "POST" && url.pathname === "/api/settings") {
        const body = await readJsonBody<{ settingId?: string; path?: string; value?: unknown }>(request);
        const current = await loadOrCreateState(storeOptions);
        const key = body.settingId ?? body.path;
        if (!key) {
          sendError(response, 400, "setting_required", "settingId or path is required.");
          return;
        }
        const next = updateSetting(current, key, body.value as PlayLensState["settingsGroups"][number]["items"][number]["value"]);
        await saveAppStateSnapshot(process.env.PLAYLENS_STORAGE_DIR ? createRecordingBackedState(next) : next, storeOptions);
        sendJson(response, 200, { status: "ok", state: await getHydratedState(storeOptions) });
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/search") {
        const query = url.searchParams.get("q") ?? "";
        const state = await getHydratedState(storeOptions);
        sendJson(response, 200, searchApp(state, query));
        return;
      }

      if (request.method === "GET" && url.pathname === "/api/artifact") {
        const sessionId = url.searchParams.get("sessionId");
        const artifactPath = url.searchParams.get("path");
        if (!sessionId || !artifactPath) {
          sendError(response, 400, "bad_request", "sessionId and path are required.");
          return;
        }
        const paths = getStoragePaths(storeOptions);
        const artifactsDir = path.resolve(paths.sessionsDir, safePathPart(sessionId), "artifacts");
        const filePath = path.resolve(artifactsDir, artifactPath);
        if (!filePath.startsWith(`${artifactsDir}${path.sep}`)) {
          sendError(response, 400, "bad_artifact_path", "Artifact path must stay inside the session artifacts directory.");
          return;
        }
        const bytes = await fs.readFile(filePath);
        sendBinary(response, 200, bytes, contentTypeForArtifact(filePath));
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
        const result = await createSessionExport(format, state, storeOptions, { replaceTasksFromSessions: Boolean(process.env.PLAYLENS_STORAGE_DIR) });
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

async function getHydratedState(storeOptions: { projectRoot?: string }, options: { eventLimit?: number; compactRuntimeMarkers?: boolean } = {}): Promise<PlayLensState> {
  return hydrateStateFromStoredSessions(await loadOrCreateState(storeOptions), storeOptions, {
    eventLimit: options.eventLimit,
    compactRuntimeMarkers: options.compactRuntimeMarkers,
    replaceTasksFromSessions: Boolean(process.env.PLAYLENS_STORAGE_DIR)
  });
}

function createRecordingBackedState(existing: PlayLensState | null): PlayLensState {
  const empty = createEmptyAppState();
  if (!existing) return empty;
  return {
    ...empty,
    tasks: existing.tasks,
    settingsGroups: ensureCompleteSettingsGroups(existing.settingsGroups),
    projectScopes: existing.projectScopes.filter((scope) => isRelevantProjectScope(scope.rootPath)),
    auditLog: existing.auditLog,
    aiAgent: { ...existing.aiAgent, messages: [] },
    agent: { ...existing.aiAgent, messages: [] },
    uploadedFiles: existing.uploadedFiles,
    lastUpdatedAt: existing.lastUpdatedAt,
    system: empty.system
  };
}

function isRelevantProjectScope(rootPath: string): boolean {
  if (!existsSync(rootPath)) return false;
  if (!process.env.PLAYLENS_STORAGE_DIR) return true;
  const storageProjectRoot = path.dirname(path.dirname(path.resolve(process.env.PLAYLENS_STORAGE_DIR)));
  return path.resolve(rootPath) === storageProjectRoot;
}

function createApiManifest(storageRoot: string) {
  const baseUrl = `http://${process.env.PLAYLENS_API_HOST ?? DEFAULT_HOST}:${process.env.PLAYLENS_API_PORT ?? DEFAULT_PORT}`;
  return {
    status: "ok",
    name: "PlayLens Local API",
    version: "0.1.0",
    localOnly: true,
    defaultBaseUrl: baseUrl,
    storageRoot,
    auth: {
      required: false,
      note: "The default server binds to 127.0.0.1 for local-device access only."
    },
    endpoints: [
      { method: "GET", path: "/api/health", description: "Backend health, version, and active storage root." },
      { method: "GET", path: "/api/manifest", description: "Local API endpoint catalog, schema notes, and local-only status." },
      { method: "GET", path: "/api/state", description: "Complete hydrated PlayLens state for dashboards and custom tools." },
      { method: "GET", path: "/api/tasks", description: "Task list derived from current recording sessions." },
      { method: "GET", path: "/api/tasks/:taskId", description: "One task by id." },
      { method: "GET", path: "/api/sessions", description: "Stored session summaries." },
      { method: "GET", path: "/api/sessions/:sessionId", description: "One session with its events, issues, and metrics." },
      { method: "GET", path: "/api/sessions/:sessionId/events", description: "Events for one session. Supports kind and limit query params." },
      { method: "GET", path: "/api/sessions/:sessionId/artifacts", description: "Artifact index for one session." },
      { method: "GET", path: "/api/events", description: "Events filtered by taskId, sessionId, kind, and limit." },
      { method: "GET", path: "/api/issues", description: "Issues filtered by taskId or sessionId." },
      { method: "GET", path: "/api/metrics", description: "CPU and memory samples filtered by taskId or sessionId." },
      { method: "GET", path: "/api/settings", description: "Durable settings groups used by UI, recorder, SDK, and API." },
      { method: "POST", path: "/api/settings", description: "Update one setting with { settingId | path, value }." },
      { method: "GET", path: "/api/project-scopes", description: "Watched folders and project-scope metadata." },
      { method: "GET", path: "/api/audit", description: "Audit records for user, system, and AI actions." },
      { method: "GET", path: "/api/ai/messages", description: "AI agent state and stored AI conversation messages." },
      { method: "GET", path: "/api/uploads", description: "Uploaded-file metadata and extraction status." },
      { method: "GET", path: "/api/search?q=<query>", description: "Search tasks, events, issues, settings, AI messages, and scopes." },
      { method: "GET", path: "/api/export?format=json|ndjson|markdown", description: "Export recorded data for code, reports, or archives." },
      { method: "GET", path: "/api/artifacts", description: "Artifact index across sessions, optionally filtered by sessionId." },
      { method: "GET", path: "/api/artifact?sessionId=<id>&path=<file>", description: "Read a local artifact inside one session." },
      { method: "GET", path: "/api/raw/state", description: "Hydrated state, saved app state, storage paths, and storage file index." },
      { method: "GET", path: "/api/raw/files/index", description: "Raw PlayLens storage file index with sizes and modified times." },
      { method: "GET", path: "/api/raw/sessions", description: "Raw session manifests plus event and artifact counts." },
      { method: "GET", path: "/api/raw/sessions/:sessionId/manifest", description: "Raw session manifest exactly as stored." },
      { method: "GET", path: "/api/raw/sessions/:sessionId/events", description: "Raw parsed event lines exactly as stored." }
    ],
    sdkExample: [
      "import { PlayLensClient } from './src/sdk/client';",
      "const client = new PlayLensClient({ baseUrl: 'http://127.0.0.1:4174' });",
      "const tasks = await client.listTasks();",
      "const events = await client.listEvents({ kind: 'network.response' });"
    ].join("\n")
  };
}

function applyEventQuery(events: PlayLensState["events"], url: URL): PlayLensState["events"] {
  const taskId = url.searchParams.get("taskId");
  const sessionId = url.searchParams.get("sessionId");
  const kind = url.searchParams.get("kind");
  const severity = url.searchParams.get("severity");
  const limit = parsePositiveInteger(url.searchParams.get("limit"));
  const filtered = events.filter((event) =>
    (!taskId || event.taskId === taskId) &&
    (!sessionId || event.sessionId === sessionId) &&
    (!kind || event.kind === kind) &&
    (!severity || event.severity === severity)
  );
  return limit ? filtered.slice(-limit) : filtered;
}

async function listRawSessions(paths: ReturnType<typeof getStoragePaths>) {
  const entries = await safeReadDir(paths.sessionsDir);
  const sessions = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const sessionId = entry.name;
      const manifest = await readRawSessionManifest(paths, sessionId);
      const events = await readRawSessionEvents(paths, sessionId);
      const artifacts = await listArtifactsForSession(paths, sessionId);
      return manifest ? { sessionId, manifest, eventCount: events.length, artifactCount: artifacts.length } : undefined;
    }));
  return sessions.filter((session): session is NonNullable<typeof session> => Boolean(session));
}

async function readRawSessionManifest(paths: ReturnType<typeof getStoragePaths>, sessionId: string): Promise<Record<string, unknown> | null> {
  const filePath = path.join(paths.sessionsDir, safePathPart(sessionId), "manifest.json");
  return readJsonFile(filePath);
}

async function readRawSessionEvents(paths: ReturnType<typeof getStoragePaths>, sessionId: string): Promise<Record<string, unknown>[]> {
  const filePath = path.join(paths.sessionsDir, safePathPart(sessionId), "events.ndjson");
  const content = await readTextFile(filePath);
  if (!content) return [];
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function listAllArtifacts(paths: ReturnType<typeof getStoragePaths>) {
  const entries = await safeReadDir(paths.sessionsDir);
  const nested = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => listArtifactsForSession(paths, entry.name)));
  return nested.flat();
}

async function listArtifactsForSession(paths: ReturnType<typeof getStoragePaths>, sessionId: string) {
  const artifactsDir = path.join(paths.sessionsDir, safePathPart(sessionId), "artifacts");
  return (await listFilesRecursive(artifactsDir)).map((file) => ({
    sessionId,
    ...file,
    url: `/api/artifact?sessionId=${encodeURIComponent(sessionId)}&path=${encodeURIComponent(file.relativePath)}`
  }));
}

async function createStorageFileIndex(paths: ReturnType<typeof getStoragePaths>) {
  const roots = [
    { kind: "state", root: paths.stateDir },
    { kind: "sessions", root: paths.sessionsDir },
    { kind: "exports", root: paths.exportsDir }
  ];
  const files = await Promise.all(roots.map(async ({ kind, root }) =>
    (await listFilesRecursive(root)).map((file) => ({ kind, root, ...file }))
  ));
  return files.flat();
}

async function listFilesRecursive(root: string, current = root): Promise<Array<{ relativePath: string; absolutePath: string; sizeBytes: number; modifiedAt: string }>> {
  const entries = await safeReadDir(current);
  const files = await Promise.all(entries.map(async (entry) => {
    const absolutePath = path.join(current, entry.name);
    if (entry.isDirectory()) return listFilesRecursive(root, absolutePath);
    if (!entry.isFile()) return [];
    const stat = await fs.stat(absolutePath);
    return [{
      relativePath: path.relative(root, absolutePath),
      absolutePath,
      sizeBytes: stat.size,
      modifiedAt: stat.mtime.toISOString()
    }];
  }));
  return files.flat();
}

async function safeReadDir(dir: string) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function readJsonFile(filePath: string): Promise<Record<string, unknown> | null> {
  const content = await readTextFile(filePath);
  return content ? JSON.parse(content) as Record<string, unknown> : null;
}

async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function addInitializedProjectScope(state: PlayLensState, folderPath: string): PlayLensState {
  const result = initProjectScope(folderPath);
  const now = new Date().toISOString();
  const scope = {
    id: `scope-${slugify(result.config.name)}-${Date.now().toString(36)}` as PlayLensState["projectScopes"][number]["id"],
    name: result.config.name,
    rootPath: result.rootPath,
    configPath: result.configPath,
    status: "active" as const,
    include: result.config.scope.include,
    exclude: result.config.scope.exclude,
    storageMode: result.config.storage.mode,
    autoCreateTasks: result.config.tasks.autoCreate,
    recordOnlyWhenPlaywrightDetected: result.config.tasks.recordOnlyWhenPlaywrightDetected,
    createdAt: result.config.createdAt,
    updatedAt: now,
    detected: result.detected
  };
  return {
    ...state,
    projectScopes: [scope, ...state.projectScopes.filter((item) => item.rootPath !== scope.rootPath)],
    auditLog: [
      {
        id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}` as PlayLensState["auditLog"][number]["id"],
        timestamp: now,
        actor: "user",
        action: result.created ? "projectScope.init" : "projectScope.add",
        summary: `${result.created ? "Initialized" : "Added"} watched folder "${scope.name}".`,
        entityType: "project-scope",
        entityId: scope.id
      },
      ...state.auditLog
    ],
    lastUpdatedAt: now
  };
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 36) || "project";
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

function parsePositiveInteger(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
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

function sendBinary(response: ServerResponse, statusCode: number, body: Buffer, contentType: string): void {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
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

function contentTypeForArtifact(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".txt" || ext === ".md") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function safePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
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
