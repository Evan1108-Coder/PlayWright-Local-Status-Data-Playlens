import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { RecorderStore, type RecorderSeverity } from "./storage";
import { findProjectRoot, resolveProjectStorageRoot } from "./projectScope";

export interface RunSupervisorOptions {
  command: string[];
  cwd?: string;
  injectRuntime?: boolean;
  storageRoot?: string;
}

export interface RunSupervisorResult {
  sessionId: string;
  taskId: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  storageRoot: string;
  sessionDir: string;
}

const PLAYLENS_MARKER_PREFIX = "[PlayLens]";

export async function runSupervisedCommand(options: RunSupervisorOptions): Promise<RunSupervisorResult> {
  if (!options.command.length) {
    throw new Error("No command provided. Use: playlens run -- <command...>");
  }

  const cwd = resolve(options.cwd ?? process.cwd());
  const commandText = options.command.join(" ");
  const projectRoot = findProjectRoot(cwd) ?? cwd;
  const store = new RecorderStore(options.storageRoot ?? resolveProjectStorageRoot(projectRoot));
  const session = store.createSession({ command: commandText, cwd, name: deriveRunName(options.command) });
  const registerPath = getRuntimeRegisterPath();
  const canInject = options.injectRuntime !== false && existsSync(registerPath);
  const childEnv = {
    ...process.env,
    PLAYLENS_SESSION_ID: session.manifest.sessionId,
    PLAYLENS_TASK_ID: session.manifest.taskId,
    PLAYLENS_STORAGE_DIR: store.storageRoot,
    PLAYLENS_SUPERVISED: "1",
    NODE_OPTIONS: canInject ? mergeNodeOptions(process.env.NODE_OPTIONS, registerPath) : process.env.NODE_OPTIONS
  };

  store.writeEvent(session, {
    kind: "process.started",
    severity: "info",
    title: "Process started",
    message: commandText,
    data: { cwd, command: options.command, runtimeInjected: canInject, registerPath }
  });

  return new Promise((resolvePromise) => {
    const child = spawn(options.command[0], options.command.slice(1), {
      cwd,
      env: childEnv,
      shell: process.platform === "win32",
      stdio: ["inherit", "pipe", "pipe"]
    });

    session.manifest.pid = child.pid;
    store.writeEvent(session, {
      kind: "process.pid",
      severity: "trace",
      title: "Process PID",
      message: child.pid ? `PID ${child.pid}` : "PID unavailable",
      data: { pid: child.pid }
    });

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      process.stdout.write(text);
      writeTerminalChunk(store, session, "stdout", text);
      for (const marker of extractPlayLensMarkers(text)) {
        store.writeEvent(session, markerToEvent(marker));
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      process.stderr.write(text);
      writeTerminalChunk(store, session, "stderr", text);
      for (const marker of extractPlayLensMarkers(text)) {
        store.writeEvent(session, markerToEvent(marker));
      }
    });

    child.on("error", (error) => {
      store.writeEvent(session, {
        kind: "process.error",
        severity: "critical",
        title: "Process error",
        message: error.message,
        data: { stack: error.stack }
      });
    });

    child.on("close", (exitCode, signal) => {
      const severity = exitCode === 0 ? "info" : "error";
      store.writeEvent(session, {
        kind: "process.exited",
        severity,
        title: "Process exited",
        message: `Exit code ${exitCode ?? "null"}${signal ? `, signal ${signal}` : ""}`,
        data: { exitCode, signal }
      });
      store.finishSession(session, { exitCode, signal });
      resolvePromise({
        sessionId: session.manifest.sessionId,
        taskId: session.manifest.taskId,
        exitCode,
        signal,
        storageRoot: store.storageRoot,
        sessionDir: session.paths.sessionDir
      });
    });
  });
}

export function getRuntimeRegisterPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..", "playlens-runtime", "register.cjs");
}

function writeTerminalChunk(store: RecorderStore, session: Parameters<RecorderStore["writeEvent"]>[0], stream: "stdout" | "stderr", text: string): void {
  const trimmed = text.replace(/\s+$/g, "");
  store.writeEvent(session, {
    kind: "terminal.output",
    severity: stream === "stderr" ? "warning" : "trace",
    title: stream,
    message: trimmed.slice(0, 500) || `[${text.length} bytes]`,
    data: { stream, text, byteLength: Buffer.byteLength(text) }
  });
}

function mergeNodeOptions(existing: string | undefined, registerPath: string): string {
  const requireFlag = `--require ${JSON.stringify(registerPath)}`;
  if (!existing?.trim()) return requireFlag;
  if (existing.includes(registerPath)) return existing;
  return `${existing} ${requireFlag}`;
}

function deriveRunName(command: string[]): string {
  const useful = command.find((part) => /\.(mjs|cjs|js|ts|tsx)$/.test(part)) ?? command[0];
  return useful ? useful.split(/[\\/]/).at(-1) ?? useful : "PlayLens Run";
}

function extractPlayLensMarkers(text: string): Array<Record<string, unknown>> {
  return text
    .split(/\r?\n/)
    .filter((line) => line.startsWith(PLAYLENS_MARKER_PREFIX))
    .map((line) => {
      const jsonStart = line.indexOf("{");
      if (jsonStart === -1) return { kind: "playlens.marker", message: line };
      try {
        return JSON.parse(line.slice(jsonStart)) as Record<string, unknown>;
      } catch {
        return { kind: "playlens.marker", message: line };
      }
    });
}

function markerToEvent(marker: Record<string, unknown>) {
  const kind = typeof marker.kind === "string" ? marker.kind : "playlens.marker";
  const message = typeof marker.message === "string" ? marker.message : kind;
  const severity: RecorderSeverity =
    marker.severity === "critical"
      ? "critical"
      : marker.severity === "error"
        ? "error"
        : marker.severity === "warning"
          ? "warning"
          : marker.severity === "trace"
            ? "trace"
            : "info";
  return {
    kind,
    severity,
    title: typeof marker.title === "string" ? marker.title : "Runtime marker",
    message,
    data: marker
  };
}
