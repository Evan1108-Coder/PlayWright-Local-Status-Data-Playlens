import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  ExportFormat,
  ExportResult,
  SessionEventAppendResult,
  SessionManifest,
  StoredSessionSummary
} from "../server/apiTypes";
import type { Session, SessionId, TimelineEvent } from "../data/types";
import type { PlayLensState } from "../state/appState";
import { createExportContent } from "../exporters/exporters";

const DATA_DIR_NAME = ".playlens-data";
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
  return {
    rootDir,
    stateDir: path.join(rootDir, "state"),
    snapshotsDir: path.join(rootDir, "state", "snapshots"),
    sessionsDir: path.join(rootDir, "sessions"),
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
  const manifests = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => readJsonFile<SessionManifest>(path.join(paths.sessionsDir, entry.name, "manifest.json")))
  );

  return manifests
    .filter((manifest): manifest is SessionManifest => Boolean(manifest))
    .map((manifest) => ({
      id: manifest.session.id,
      taskId: manifest.session.taskId,
      title: manifest.session.title,
      status: manifest.session.status,
      browserName: manifest.session.browser.name,
      startedAt: manifest.session.startedAt,
      updatedAt: manifest.updatedAt,
      currentUrl: manifest.session.currentUrl,
      eventCount: manifest.eventCount,
      issueCount: manifest.session.issueIds.length
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function createSessionExport(
  format: ExportFormat,
  state: PlayLensState,
  options: SessionStoreOptions = {}
): Promise<ExportResult> {
  const paths = await initializeStorage(options);
  const exportContent = createExportContent(state, format);
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
