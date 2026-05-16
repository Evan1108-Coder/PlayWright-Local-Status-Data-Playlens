import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { RecorderStore, type RecorderSeverity } from "./storage";
import { findProjectRoot, resolveProjectStorageRoot, readProjectConfig, detectProject } from "./projectScope";
import type { SessionId, TaskId } from "../data/types";

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

  if (!shouldRecordCommand(projectRoot, cwd, options.command)) {
    return runPassthrough(options.command, cwd);
  }

  const store = new RecorderStore(options.storageRoot ?? resolveProjectStorageRoot(projectRoot));
  const session = store.createSession({ command: commandText, cwd, name: deriveRunName(options.command) });
  const registerPath = getRuntimeRegisterPath();
  const esmRegisterPath = getEsmRegisterPath();
  const canInject = options.injectRuntime !== false && existsSync(registerPath);
  const canInjectEsm = canInject && existsSync(esmRegisterPath) && supportsImportFlag();
  const childEnv = {
    ...process.env,
    PLAYLENS_SESSION_ID: session.manifest.sessionId,
    PLAYLENS_TASK_ID: session.manifest.taskId,
    PLAYLENS_STORAGE_DIR: store.storageRoot,
    PLAYLENS_SUPERVISED: "1",
    NODE_OPTIONS: canInject ? mergeNodeOptions(process.env.NODE_OPTIONS, registerPath, canInjectEsm ? esmRegisterPath : undefined) : process.env.NODE_OPTIONS
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

export function getEsmRegisterPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..", "playlens-runtime", "register-esm.mjs");
}

function supportsImportFlag(): boolean {
  const parts = process.versions.node.split(".").map(Number);
  return parts[0] > 18 || (parts[0] === 18 && parts[1] >= 19);
}

function writeTerminalChunk(store: RecorderStore, session: Parameters<RecorderStore["writeEvent"]>[0], stream: "stdout" | "stderr", text: string): void {
  const trimmed = stripPlayLensMarkerLines(text).replace(/\s+$/g, "");
  if (!trimmed) return;
  store.writeEvent(session, {
    kind: "terminal.output",
    severity: stream === "stderr" ? "warning" : "trace",
    title: stream,
    message: trimmed.slice(0, 500) || `[${text.length} bytes]`,
    data: { stream, text, byteLength: Buffer.byteLength(text) }
  });
}

function stripPlayLensMarkerLines(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !line.startsWith(PLAYLENS_MARKER_PREFIX))
    .join("\n");
}

function mergeNodeOptions(existing: string | undefined, registerPath: string, esmRegisterPath?: string): string {
  let result = existing?.trim() ?? "";
  if (!result.includes(registerPath)) {
    const requireFlag = `--require ${JSON.stringify(registerPath)}`;
    result = result ? `${result} ${requireFlag}` : requireFlag;
  }
  if (esmRegisterPath && !result.includes(esmRegisterPath)) {
    result = `${result} --import ${JSON.stringify(esmRegisterPath)}`;
  }
  return result;
}

function shouldRecordCommand(projectRoot: string, cwd: string, command: string[]): boolean {
  try {
    const config = readProjectConfig(projectRoot);
    if (!config.tasks.recordOnlyWhenPlaywrightDetected) return true;
  } catch {
    return true;
  }

  const commandStr = command.join(" ").toLowerCase();
  if (commandStr.includes("playwright")) return true;

  const detected = detectProject(cwd);
  if (detected.playwrightConfig || detected.npmScripts.length > 0 || detected.testFiles > 0) return true;

  try {
    const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    if (pkg.dependencies?.["playwright"] || pkg.devDependencies?.["playwright"] ||
        pkg.dependencies?.["@playwright/test"] || pkg.devDependencies?.["@playwright/test"]) return true;
  } catch { /* no package.json or parse error */ }

  return false;
}

function runPassthrough(command: string[], cwd: string): Promise<RunSupervisorResult> {
  return new Promise((resolvePromise) => {
    const child = spawn(command[0], command.slice(1), {
      cwd,
      shell: process.platform === "win32",
      stdio: "inherit"
    });
    child.on("error", () => {
      resolvePromise({ sessionId: "session-skipped" as SessionId, taskId: "task-skipped" as TaskId, exitCode: 1, signal: null, storageRoot: "", sessionDir: "" });
    });
    child.on("close", (exitCode, signal) => {
      resolvePromise({ sessionId: "session-skipped" as SessionId, taskId: "task-skipped" as TaskId, exitCode, signal, storageRoot: "", sessionDir: "" });
    });
  });
}

function deriveRunName(command: string[]): string {
  if ((command[0] === "npm" || command[0] === "pnpm" || command[0] === "yarn") && command[1] === "run" && command[2]) {
    return command[2]
      .split(/[:_-]+/g)
      .filter(Boolean)
      .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
      .join(" ");
  }
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
