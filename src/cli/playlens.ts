#!/usr/bin/env node
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { initProjectScope, findProjectRoot, detectProject, resolveProjectStorageRoot } from "../recorder/projectScope";
import { RecorderStore, renderMarkdownExport } from "../recorder/storage";
import { getRuntimeRegisterPath, runSupervisedCommand } from "../recorder/supervisor";

type ExportFormat = "json" | "ndjson" | "markdown";

const args = process.argv.slice(2);

process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const command = args[0] ?? "help";
  switch (command) {
    case "init":
      initCommand(args.slice(1));
      return;
    case "run":
      await runCommand(args.slice(1));
      return;
    case "server":
      await serverCommand(args.slice(1));
      return;
    case "export":
      exportCommand(args.slice(1));
      return;
    case "doctor":
      doctorCommand();
      return;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return;
    default:
      throw new Error(`Unknown command "${command}". Run "playlens help".`);
  }
}

function initCommand(input: string[]): void {
  const folder = input[0] ?? process.cwd();
  const result = initProjectScope(folder);
  console.log(`${result.created ? "Created" : "Found"} PlayLens project scope`);
  console.log(`Root: ${result.rootPath}`);
  console.log(`Config: ${result.configPath}`);
  console.log(`Detected: package.json=${result.detected.packageJson}, playwrightConfig=${result.detected.playwrightConfig}, testFiles=${result.detected.testFiles}`);
  if (result.detected.npmScripts.length) console.log(`Likely scripts: ${result.detected.npmScripts.join(", ")}`);
}

async function runCommand(input: string[]): Promise<void> {
  const separatorIndex = input.indexOf("--");
  const childCommand = separatorIndex >= 0 ? input.slice(separatorIndex + 1) : input;
  const result = await runSupervisedCommand({ command: childCommand });
  console.log("");
  console.log(`PlayLens session: ${result.sessionId}`);
  console.log(`Storage: ${result.sessionDir}`);
  process.exitCode = result.exitCode ?? (result.signal ? 1 : 0);
}

async function serverCommand(input: string[]): Promise<void> {
  const mode = input.includes("--static") ? "static" : "dev";
  if (mode === "static") {
    await staticServer();
    return;
  }
  await spawnAndWait("npm", ["run", "dev", "--", "--host", "127.0.0.1"], repoRoot());
}

function exportCommand(input: string[]): void {
  const format = readFlag(input, "--format", "json") as ExportFormat;
  if (!["json", "ndjson", "markdown"].includes(format)) {
    throw new Error("Unsupported export format. Use json, ndjson, or markdown.");
  }
  const root = readFlag(input, "--root", findProjectRoot() ?? process.cwd());
  const sessionId = readFlag(input, "--session");
  const store = new RecorderStore(resolveProjectStorageRoot(root));
  const sessions = store.listSessions().filter((session) => !sessionId || session.manifest.sessionId === sessionId);

  if (format === "json") {
    console.log(JSON.stringify({ exportedAt: new Date().toISOString(), sessions: sessions.map((session) => ({
      manifest: session.manifest,
      events: store.readEvents(session)
    })) }, null, 2));
    return;
  }

  if (format === "ndjson") {
    for (const session of sessions) {
      for (const event of store.readEvents(session)) console.log(JSON.stringify(event));
    }
    return;
  }

  console.log(renderMarkdownExport(sessions, (session) => store.readEvents(session)));
}

function doctorCommand(): void {
  const cwd = process.cwd();
  const projectRoot = findProjectRoot(cwd);
  const detection = detectProject(projectRoot ?? cwd);
  const registerPath = getRuntimeRegisterPath();
  console.log("PlayLens Doctor");
  console.log(`Node: ${process.version}`);
  console.log(`Platform: ${process.platform}`);
  console.log(`CWD: ${cwd}`);
  console.log(`Project scope: ${projectRoot ?? "not found"}`);
  console.log(`Runtime register: ${existsSync(registerPath) ? registerPath : "missing"}`);
  console.log(`Storage root: ${resolveProjectStorageRoot(projectRoot ?? cwd)}`);
  console.log(`package.json: ${detection.packageJson}`);
  console.log(`playwright config: ${detection.playwrightConfig}`);
  console.log(`likely test files: ${detection.testFiles}`);
  console.log(`likely npm scripts: ${detection.npmScripts.join(", ") || "none"}`);
}

function printHelp(): void {
  console.log(`PlayLens recorder CLI

Usage:
  playlens init [folder]
  playlens run -- <command...>
  playlens server [--static]
  playlens export --format json|ndjson|markdown [--session <id>] [--root <folder>]
  playlens doctor
`);
}

async function spawnAndWait(command: string, commandArgs: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, commandArgs, { cwd, stdio: "inherit", shell: process.platform === "win32" });
    child.on("error", reject);
    child.on("close", (code) => {
      process.exitCode = code ?? 0;
      resolvePromise();
    });
  });
}

async function staticServer(): Promise<void> {
  const dist = join(repoRoot(), "dist");
  if (!existsSync(dist)) throw new Error("dist/ does not exist. Run npm run build first.");
  const port = Number(process.env.PLAYLENS_PORT ?? 4173);
  const server = createServer((request, response) => {
    const requestPath = new URL(request.url ?? "/", `http://127.0.0.1:${port}`).pathname;
    const filePath = resolve(dist, requestPath === "/" ? "index.html" : requestPath.slice(1));
    const safePath = filePath.startsWith(dist) && existsSync(filePath) ? filePath : join(dist, "index.html");
    response.setHeader("Content-Type", contentType(safePath));
    response.end(readFileSync(safePath));
  });
  await new Promise<void>((resolvePromise) => {
    server.listen(port, "127.0.0.1", () => {
      console.log(`PlayLens static server: http://127.0.0.1:${port}/`);
      resolvePromise();
    });
  });
}

function readFlag(input: string[], flag: string, fallback?: string): string {
  const index = input.indexOf(flag);
  if (index === -1) return fallback ?? "";
  return input[index + 1] ?? fallback ?? "";
}

function repoRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function contentType(path: string): string {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}
