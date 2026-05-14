import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export type RecorderSeverity = "trace" | "info" | "warning" | "error" | "critical";

export interface RecorderEvent {
  id: string;
  sessionId: string;
  taskId: string;
  kind: string;
  severity: RecorderSeverity;
  title: string;
  message: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface RecorderManifest {
  sessionId: string;
  taskId: string;
  name: string;
  command: string;
  cwd: string;
  status: "running" | "completed" | "failed" | "stopped";
  startedAt: string;
  endedAt?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
  pid?: number;
  nodeVersion: string;
  platform: NodeJS.Platform;
  eventCount: number;
  storageVersion: 1;
}

export interface RecorderSessionPaths {
  storageRoot: string;
  sessionDir: string;
  manifestPath: string;
  eventsPath: string;
  artifactsDir: string;
}

export interface RecorderSession {
  manifest: RecorderManifest;
  paths: RecorderSessionPaths;
}

export class RecorderStore {
  readonly storageRoot: string;

  constructor(storageRoot = defaultStorageRoot()) {
    this.storageRoot = resolve(storageRoot);
    mkdirSync(this.storageRoot, { recursive: true });
  }

  createSession(input: { command: string; cwd: string; name?: string }): RecorderSession {
    const now = new Date().toISOString();
    const sessionId = `session-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
    const taskId = `task-${stableSlug(input.name || firstCommandToken(input.command) || "playlens-run")}-${randomUUID().slice(0, 6)}`;
    const sessionDir = join(this.storageRoot, sessionId);
    const paths: RecorderSessionPaths = {
      storageRoot: this.storageRoot,
      sessionDir,
      manifestPath: join(sessionDir, "manifest.json"),
      eventsPath: join(sessionDir, "events.ndjson"),
      artifactsDir: join(sessionDir, "artifacts")
    };

    mkdirSync(paths.artifactsDir, { recursive: true });
    const manifest: RecorderManifest = {
      sessionId,
      taskId,
      name: input.name || firstCommandToken(input.command) || "PlayLens Run",
      command: input.command,
      cwd: resolve(input.cwd),
      status: "running",
      startedAt: now,
      nodeVersion: process.version,
      platform: process.platform,
      eventCount: 0,
      storageVersion: 1
    };

    writeJson(paths.manifestPath, manifest);
    writeFileSync(paths.eventsPath, "", "utf8");
    const session = { manifest, paths };
    this.writeEvent(session, {
      kind: "task.created",
      severity: "info",
      title: "Task created",
      message: `Started ${manifest.command}`,
      data: { cwd: manifest.cwd, command: manifest.command }
    });
    return session;
  }

  writeEvent(
    session: RecorderSession,
    event: Omit<Partial<RecorderEvent>, "id" | "sessionId" | "taskId" | "timestamp"> & {
      kind: string;
      title: string;
      message: string;
      data?: Record<string, unknown>;
    }
  ): RecorderEvent {
    const fullEvent: RecorderEvent = {
      id: `event-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
      sessionId: session.manifest.sessionId,
      taskId: session.manifest.taskId,
      kind: event.kind,
      severity: event.severity ?? "info",
      title: event.title,
      message: event.message,
      timestamp: new Date().toISOString(),
      data: event.data ?? {}
    };

    appendFileSync(session.paths.eventsPath, `${JSON.stringify(fullEvent)}\n`, "utf8");
    session.manifest.eventCount += 1;
    writeJson(session.paths.manifestPath, session.manifest);
    return fullEvent;
  }

  finishSession(
    session: RecorderSession,
    input: { exitCode?: number | null; signal?: NodeJS.Signals | null; status?: RecorderManifest["status"] }
  ): RecorderManifest {
    const status = input.status ?? (input.exitCode === 0 ? "completed" : "failed");
    session.manifest.status = status;
    session.manifest.endedAt = new Date().toISOString();
    session.manifest.exitCode = input.exitCode ?? null;
    session.manifest.signal = input.signal ?? null;
    writeJson(session.paths.manifestPath, session.manifest);
    return session.manifest;
  }

  listSessions(): RecorderSession[] {
    if (!existsSync(this.storageRoot)) return [];
    return readdirSync(this.storageRoot)
      .map((name) => join(this.storageRoot, name))
      .filter((path) => existsSync(join(path, "manifest.json")) && statSync(path).isDirectory())
      .map((sessionDir) => {
        const manifestPath = join(sessionDir, "manifest.json");
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as RecorderManifest;
        return {
          manifest,
          paths: {
            storageRoot: this.storageRoot,
            sessionDir,
            manifestPath,
            eventsPath: join(sessionDir, "events.ndjson"),
            artifactsDir: join(sessionDir, "artifacts")
          }
        };
      })
      .sort((a, b) => b.manifest.startedAt.localeCompare(a.manifest.startedAt));
  }

  readEvents(session: RecorderSession): RecorderEvent[] {
    if (!existsSync(session.paths.eventsPath)) return [];
    return readFileSync(session.paths.eventsPath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as RecorderEvent);
  }
}

export function defaultStorageRoot(projectRoot = process.cwd()): string {
  if (process.env.PLAYLENS_STORAGE_DIR) return process.env.PLAYLENS_STORAGE_DIR;
  const projectLocal = join(resolve(projectRoot), ".playlens", "sessions");
  if (existsSync(join(resolve(projectRoot), ".playlens", "project.json"))) return projectLocal;
  return join(homedir(), ".playlens", "sessions");
}

export function renderMarkdownExport(sessions: RecorderSession[], readEvents: (session: RecorderSession) => RecorderEvent[]): string {
  const lines = ["# PlayLens Export", "", `Generated: ${new Date().toISOString()}`, ""];
  for (const session of sessions) {
    const events = readEvents(session);
    lines.push(`## ${session.manifest.name}`);
    lines.push("");
    lines.push(`- Session: \`${session.manifest.sessionId}\``);
    lines.push(`- Status: \`${session.manifest.status}\``);
    lines.push(`- Command: \`${session.manifest.command}\``);
    lines.push(`- CWD: \`${session.manifest.cwd}\``);
    lines.push(`- Started: ${session.manifest.startedAt}`);
    if (session.manifest.endedAt) lines.push(`- Ended: ${session.manifest.endedAt}`);
    if (typeof session.manifest.exitCode !== "undefined") lines.push(`- Exit code: ${session.manifest.exitCode}`);
    lines.push("");
    lines.push("| Time | Kind | Severity | Message |");
    lines.push("| --- | --- | --- | --- |");
    for (const event of events.slice(0, 200)) {
      lines.push(`| ${event.timestamp} | \`${event.kind}\` | ${event.severity} | ${escapeMarkdownTable(event.message)} |`);
    }
    if (events.length > 200) lines.push(`|  |  |  | ${events.length - 200} more events omitted from Markdown preview |`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function firstCommandToken(command: string): string {
  return command.trim().split(/\s+/)[0] ?? "";
}

function stableSlug(value: string): string {
  const hash = createHash("sha1").update(value).digest("hex").slice(0, 6);
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32) || "run";
  return `${slug}-${hash}`;
}

function escapeMarkdownTable(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
