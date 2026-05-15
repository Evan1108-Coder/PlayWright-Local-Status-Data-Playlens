import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  ExportFormat,
  ExportResult,
  SessionEventAppendResult,
  SessionManifest,
  StoredSessionSummary
} from "../server/apiTypes";
import type { BrowserName, EventId, EventKind, EventSeverity, Issue, IssueCategory, IssueId, Session, SessionId, Task, TaskId, TimelineEvent } from "../data/types";
import type { PlayLensState } from "../state/appState";
import { createExportContent } from "../exporters/exporters";

const DATA_DIR_NAME = ".playlens";
const CURRENT_STATE_FILE = "current.json";

export interface SessionStoreOptions {
  projectRoot?: string;
  dataDir?: string;
  clock?: () => string;
}

export interface StoragePaths {
  rootDir: string;
  stateDir: string;
  snapshotsDir: string;
  sessionsDir: string;
  exportsDir: string;
}

export interface StateSnapshotSaveResult {
  savedAt: string;
  snapshotPath: string;
  currentPath: string;
}

export async function initializeStorage(options: SessionStoreOptions = {}): Promise<StoragePaths> {
  const paths = getStoragePaths(options);
  await Promise.all([
    fs.mkdir(paths.rootDir, { recursive: true }),
    fs.mkdir(paths.stateDir, { recursive: true }),
    fs.mkdir(paths.snapshotsDir, { recursive: true }),
    fs.mkdir(paths.sessionsDir, { recursive: true }),
    fs.mkdir(paths.exportsDir, { recursive: true })
  ]);
  return paths;
}

export function getStoragePaths(options: SessionStoreOptions = {}): StoragePaths {
  const rootDir = path.resolve(options.dataDir ?? path.join(options.projectRoot ?? process.cwd(), DATA_DIR_NAME));
  const sessionsDir = process.env.PLAYLENS_STORAGE_DIR
    ? path.resolve(process.env.PLAYLENS_STORAGE_DIR)
    : path.join(rootDir, "sessions");
  return {
    rootDir,
    stateDir: path.join(rootDir, "state"),
    snapshotsDir: path.join(rootDir, "state", "snapshots"),
    sessionsDir,
    exportsDir: path.join(rootDir, "exports")
  };
}

export async function saveAppStateSnapshot(state: PlayLensState, options: SessionStoreOptions = {}): Promise<StateSnapshotSaveResult> {
  const paths = await initializeStorage(options);
  const savedAt = now(options);
  const snapshotPath = path.join(paths.snapshotsDir, `state-${safeTimestamp(savedAt)}.json`);
  const currentPath = path.join(paths.stateDir, CURRENT_STATE_FILE);
  const payload = JSON.stringify({ savedAt, state }, null, 2);

  await Promise.all([
    writeJsonFile(currentPath, { savedAt, state }),
    fs.writeFile(snapshotPath, `${payload}\n`, "utf8")
  ]);

  return { savedAt, snapshotPath, currentPath };
}

export async function loadAppStateSnapshot(options: SessionStoreOptions = {}): Promise<PlayLensState | null> {
  const paths = getStoragePaths(options);
  const currentPath = path.join(paths.stateDir, CURRENT_STATE_FILE);
  const parsed = await readJsonFile<{ savedAt?: string; state?: PlayLensState }>(currentPath);
  return parsed?.state ?? null;
}

export async function createSession(session: Session, options: SessionStoreOptions = {}): Promise<SessionManifest> {
  const paths = await initializeStorage(options);
  const sessionDir = sessionPath(paths, session.id);
  const artifactsDir = path.join(sessionDir, "artifacts");
  const eventsFile = path.join(sessionDir, "events.ndjson");

  await fs.mkdir(artifactsDir, { recursive: true });
  await ensureFile(eventsFile);

  const existing = await readJsonFile<SessionManifest>(path.join(sessionDir, "manifest.json"));
  const createdAt = existing?.createdAt ?? now(options);
  const events = await readSessionEvents(session.id, options);
  const manifest: SessionManifest = {
    version: 1,
    session,
    createdAt,
    updatedAt: now(options),
    eventCount: events.length,
    eventsFile,
    artifactsDir,
    lastEventId: events.at(-1)?.id
  };

  await writeManifest(session.id, manifest, options);
  return manifest;
}

export async function readSession(sessionId: SessionId, options: SessionStoreOptions = {}): Promise<Session | null> {
  const manifest = await readManifest(sessionId, options);
  return manifest?.session ?? null;
}

export async function appendSessionEvent(
  sessionId: SessionId,
  event: TimelineEvent,
  options: SessionStoreOptions = {}
): Promise<SessionEventAppendResult> {
  const manifest = await readManifest(sessionId, options);
  if (!manifest) {
    throw new Error(`Cannot append event. Session not found: ${sessionId}`);
  }

  await fs.appendFile(manifest.eventsFile, `${JSON.stringify(event)}\n`, "utf8");
  const updatedAt = now(options);
  const nextManifest: SessionManifest = {
    ...manifest,
    updatedAt,
    eventCount: manifest.eventCount + 1,
    lastEventId: event.id,
    session: {
      ...manifest.session,
      eventIds: manifest.session.eventIds.includes(event.id)
        ? manifest.session.eventIds
        : [...manifest.session.eventIds, event.id]
    }
  };

  await writeManifest(sessionId, nextManifest, options);
  return { status: "ok", sessionId, eventId: event.id, eventCount: nextManifest.eventCount, updatedAt };
}

export async function readSessionEvents(sessionId: SessionId, options: SessionStoreOptions = {}): Promise<TimelineEvent[]> {
  const paths = getStoragePaths(options);
  const eventsFile = path.join(sessionPath(paths, sessionId), "events.ndjson");
  const content = await readTextFile(eventsFile);
  if (!content) return [];

  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as TimelineEvent);
}

export async function readManifest(sessionId: SessionId, options: SessionStoreOptions = {}): Promise<SessionManifest | null> {
  const paths = getStoragePaths(options);
  return readJsonFile<SessionManifest>(path.join(sessionPath(paths, sessionId), "manifest.json"));
}

export async function listSessions(options: SessionStoreOptions = {}): Promise<StoredSessionSummary[]> {
  const paths = await initializeStorage(options);
  const entries = await fs.readdir(paths.sessionsDir, { withFileTypes: true });
  const rawManifests = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => readJsonFile<Record<string, unknown>>(path.join(paths.sessionsDir, entry.name, "manifest.json")))
  );

  return rawManifests
    .map((raw) => parseAnyManifest(raw))
    .filter((summary): summary is StoredSessionSummary => Boolean(summary))
    .sort((a, b) => (b.endedAt ?? b.startedAt ?? b.updatedAt).localeCompare(a.endedAt ?? a.startedAt ?? a.updatedAt));
}

function parseAnyManifest(raw: Record<string, unknown> | null): StoredSessionSummary | null {
  if (!raw) return null;

  if (raw.session && typeof raw.session === "object") {
    const m = raw as unknown as SessionManifest;
    return {
      id: m.session.id,
      taskId: m.session.taskId,
      title: m.session.title,
      status: m.session.status,
      browserName: m.session.browser.name,
      startedAt: m.session.startedAt,
      endedAt: m.session.endedAt,
      updatedAt: m.updatedAt,
      currentUrl: m.session.currentUrl,
      eventCount: m.eventCount,
      issueCount: m.session.issueIds.length
    };
  }

  if (typeof raw.sessionId === "string") {
    const status = String(raw.status ?? "pending");
    return {
      id: raw.sessionId as SessionId,
      taskId: (raw.taskId ?? "task-unknown") as Session["taskId"],
      title: (raw.name as string) ?? "Recorded Session",
      status: (["running", "completed", "failed", "stopped"].includes(status) ? status : "pending") as Session["status"],
      browserName: "unknown",
      startedAt: (raw.startedAt as string) ?? new Date().toISOString(),
      endedAt: raw.endedAt as string | undefined,
      updatedAt: (raw.endedAt as string) ?? (raw.startedAt as string) ?? new Date().toISOString(),
      currentUrl: undefined,
      eventCount: (raw.eventCount as number) ?? 0,
      issueCount: 0
    };
  }

  return null;
}

export async function createSessionExport(
  format: ExportFormat,
  state: PlayLensState,
  options: SessionStoreOptions = {}
): Promise<ExportResult> {
  const paths = await initializeStorage(options);
  const exportContent = createExportContent(await hydrateStateFromStoredSessions(state, options), format);
  const createdAt = now(options);
  const fileName = `playlens-export-${safeTimestamp(createdAt)}.${exportContent.extension}`;
  const filePath = path.join(paths.exportsDir, fileName);

  await fs.writeFile(filePath, exportContent.content, "utf8");

  return {
    format,
    contentType: exportContent.contentType,
    fileName,
    filePath,
    content: exportContent.content,
    createdAt
  };
}

export async function hydrateStateFromStoredSessions(state: PlayLensState, options: SessionStoreOptions): Promise<PlayLensState> {
  const summaries = await listSessions(options);
  const existingSessionIds = new Set(state.sessions.map((session) => session.id));
  const existingEventIds = new Set(state.events.map((event) => event.id));
  const existingTaskIds = new Set(state.tasks.map((task) => task.id));
  const existingIssueIds = new Set(state.issues.map((issue) => issue.id));
  const hydratedSessions: Session[] = [];
  const hydratedTasks: Task[] = [];
  const hydratedEvents: TimelineEvent[] = [];
  const hydratedIssues: Issue[] = [];

  for (const summary of summaries) {
    const taskId = (summary.taskId ?? `task-${sanitizePathPart(summary.id)}`) as TaskId;
    const events = (await readSessionEvents(summary.id, options)).map((event, index) => normalizeStoredEvent(event, summary.id, taskId, index));
    const derivedUrl = summary.currentUrl ?? deriveCurrentUrl(events);
    const derivedDuration = deriveDurationMs(summary.startedAt, summary.endedAt, events);
    const derivedViewport = deriveViewport(events);
    const issues = events
      .filter((event) => event.kind === "issue.detected")
      .map((event) => normalizeStoredIssue(event, summary.id, taskId))
      .filter((issue) => !existingIssueIds.has(issue.id));
    const issueIds = issues.map((issue) => issue.id);

    if (!existingSessionIds.has(summary.id)) {
      hydratedSessions.push({
        id: summary.id,
        taskId,
        status: normalizeSessionStatus(summary.status),
        title: summary.title,
        browser: {
          name: normalizeBrowserName(summary.browserName),
          version: "unknown",
          headless: false,
          viewport: derivedViewport
        },
        environment: {
          os: "unknown",
          nodeVersion: "unknown",
          playwrightVersion: "unknown"
        },
        startedAt: summary.startedAt ?? summary.updatedAt,
        endedAt: summary.endedAt,
        durationMs: derivedDuration,
        currentUrl: derivedUrl,
        eventIds: events.map((event) => event.id),
        issueIds,
        metricIds: []
      });
    }

    if (!existingTaskIds.has(taskId)) {
      hydratedTasks.push({
        id: taskId,
        name: summary.title,
        originalName: summary.title,
        status: normalizeTaskStatus(summary.status),
        projectScopeId: "scope-imported-recordings",
        sessionIds: [summary.id],
        command: "",
        entryFile: "",
        cwd: "",
        createdAt: summary.startedAt ?? summary.updatedAt,
        updatedAt: summary.updatedAt,
        startedAt: summary.startedAt,
        endedAt: summary.endedAt,
        tags: ["recorded"],
        summary: {
          browser: normalizeBrowserName(summary.browserName),
          currentUrl: derivedUrl,
          eventCount: summary.eventCount,
          issueCount: Math.max(summary.issueCount ?? 0, issueIds.length),
          durationMs: derivedDuration,
          failedRequestCount: events.filter((event) => event.kind === "network.response" && Number(event.request?.status ?? event.data.status) >= 400).length
        }
      });
    }

    hydratedEvents.push(...events.filter((event) => !existingEventIds.has(event.id)));
    hydratedIssues.push(...issues);
  }

  if (hydratedSessions.length === 0 && hydratedTasks.length === 0 && hydratedEvents.length === 0 && hydratedIssues.length === 0) return state;
  return {
    ...state,
    tasks: [...state.tasks, ...hydratedTasks],
    sessions: [...state.sessions, ...hydratedSessions],
    events: [...state.events, ...hydratedEvents],
    issues: [...state.issues, ...hydratedIssues],
    selectedTaskId: state.tasks.length > 0 ? state.selectedTaskId : hydratedTasks[0]?.id ?? state.selectedTaskId
  };
}

function deriveCurrentUrl(events: TimelineEvent[]): string | undefined {
  const reversed = [...events].reverse();
  return reversed.find((event) => (event.kind === "page.navigated" || event.kind === "action.completed") && event.url)?.url
    ?? reversed.find((event) => event.url && !event.request)?.url
    ?? reversed.find((event) => event.request?.url)?.request?.url;
}

function deriveDurationMs(startedAt: string, endedAt: string | undefined, events: TimelineEvent[]): number | undefined {
  if (startedAt && endedAt) return Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime());
  if (events.length < 2) return undefined;
  return Math.max(0, new Date(events.at(-1)!.timestamp).getTime() - new Date(events[0].timestamp).getTime());
}

function deriveViewport(events: TimelineEvent[]): Session["browser"]["viewport"] {
  const viewport = events.find((event) => {
    const candidate = event.data.viewport;
    return candidate && typeof candidate === "object" && typeof (candidate as { width?: unknown }).width === "number" && typeof (candidate as { height?: unknown }).height === "number";
  })?.data.viewport as { width: number; height: number } | undefined;
  return viewport ?? { width: 0, height: 0 };
}

function normalizeStoredEvent(raw: TimelineEvent, sessionId: SessionId, taskId: TaskId, index: number): TimelineEvent {
  const embedded = raw.data && typeof raw.data === "object" && typeof (raw.data as { kind?: unknown }).kind === "string"
    ? raw.data as Partial<TimelineEvent> & { data?: Record<string, unknown> }
    : undefined;
  const data = embedded?.data && typeof embedded.data === "object"
    ? embedded.data
    : raw.data && typeof raw.data === "object"
      ? raw.data
      : {};
  const requestData = (data.request && typeof data.request === "object" ? data.request : data) as Record<string, unknown>;
  const method = typeof requestData.method === "string" ? requestData.method : raw.request?.method;
  const url = typeof requestData.url === "string" ? requestData.url : raw.request?.url;
  const status = Number(requestData.status ?? raw.request?.status);

  return {
    id: (raw.id ?? `event-${sanitizePathPart(sessionId)}-${index}`) as EventId,
    sessionId: (raw.sessionId ?? sessionId) as SessionId,
    taskId: (raw.taskId ?? taskId) as TaskId,
    kind: (embedded?.kind ?? raw.kind ?? "terminal.output") as EventKind,
    severity: (embedded?.severity ?? raw.severity ?? "info") as EventSeverity,
    title: embedded?.title ?? raw.title ?? raw.kind ?? "Recorded event",
    message: embedded?.message ?? raw.message ?? "",
    timestamp: embedded?.timestamp ?? raw.timestamp ?? now({}),
    durationMs: embedded?.durationMs ?? raw.durationMs,
    source: embedded?.source ?? raw.source,
    url: embedded?.url ?? raw.url ?? url,
    locator: embedded?.locator ?? raw.locator,
    request: embedded?.request ?? raw.request ?? (method && url
      ? {
          method,
          url,
          status: Number.isFinite(status) ? status : undefined,
          durationMs: typeof requestData.durationMs === "number" ? requestData.durationMs : undefined,
          sizeBytes: typeof requestData.sizeBytes === "number" ? requestData.sizeBytes : undefined
        }
      : undefined),
    artifactIds: Array.isArray(raw.artifactIds) ? raw.artifactIds : [],
    relatedIssueIds: Array.isArray(raw.relatedIssueIds) ? (raw.relatedIssueIds as IssueId[]) : [],
    data
  };
}

function normalizeStoredIssue(event: TimelineEvent, sessionId: SessionId, taskId: TaskId): Issue {
  const data = event.data ?? {};
  const status = Number(data.responseStatus ?? data.status ?? event.request?.status);
  const category = typeof data.category === "string" ? data.category : status >= 400 ? "network" : "test";
  const evidence: Issue["evidence"] = [
    { label: "Event", value: event.message || event.title, eventId: event.id }
  ];
  if (Number.isFinite(status)) evidence.push({ label: "Status", value: String(status), eventId: event.id });
  if (Array.isArray(data.consoleMessages) && data.consoleMessages.length) {
    evidence.push({ label: "Console", value: String(data.consoleMessages[0]), eventId: event.id });
  }

  return {
    id: (typeof data.issueId === "string" ? data.issueId : `issue-${sanitizePathPart(event.id)}`) as IssueId,
    taskId,
    sessionId,
    title: event.title || "Recorded issue",
    description: event.message || "PlayLens detected an issue in the recorded session.",
    category: normalizeIssueCategory(category),
    severity: event.severity === "critical" ? "critical" : event.severity === "error" ? "high" : "medium",
    status: "open",
    detectedAt: event.timestamp,
    source: event.source,
    eventIds: [event.id],
    evidence,
    suggestedFixes: []
  };
}

function normalizeIssueCategory(value: string): IssueCategory {
  return value === "network" || value === "console" || value === "dom" || value === "accessibility" || value === "performance" || value === "system" || value === "agent"
    ? value
    : "test";
}

function normalizeSessionStatus(value: string): Session["status"] {
  return value === "running" || value === "completed" || value === "failed" || value === "stopped" ? value : "pending";
}

function normalizeTaskStatus(value: string): Task["status"] {
  if (value === "completed") return "passed";
  if (value === "failed" || value === "stopped") return value;
  if (value === "running") return "recording";
  return "waiting-for-playwright";
}

function normalizeBrowserName(value: string | undefined): BrowserName {
  return value === "chromium" || value === "firefox" || value === "webkit" ? value : "unknown";
}

async function writeManifest(sessionId: SessionId, manifest: SessionManifest, options: SessionStoreOptions): Promise<void> {
  const paths = getStoragePaths(options);
  await fs.mkdir(sessionPath(paths, sessionId), { recursive: true });
  await writeJsonFile(path.join(sessionPath(paths, sessionId), "manifest.json"), manifest);
}

function sessionPath(paths: StoragePaths, sessionId: SessionId): string {
  return path.join(paths.sessionsDir, sanitizePathPart(sessionId));
}

async function ensureFile(filePath: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, "", "utf8");
  }
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  const content = await readTextFile(filePath);
  if (!content) return null;
  return JSON.parse(content) as T;
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function safeTimestamp(value: string): string {
  return value.replaceAll(":", "-").replaceAll(".", "-");
}

function sanitizePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function now(options: SessionStoreOptions): string {
  return options.clock?.() ?? new Date().toISOString();
}
