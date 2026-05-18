import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectProject, initProjectScope } from "../recorder/projectScope";
import { runSupervisedCommand } from "../recorder/supervisor";
import { RecorderStore } from "../recorder/storage";
import { createSessionExport } from "../storage/sessionStore";
import { createEmptyAppState, createInitialAppState } from "../state/appState";

const tempRoot = mkdtempSync(join(tmpdir(), "playlens-recorder-"));
const storageRoot = join(tempRoot, ".playlens", "sessions");
const originalStorage = process.env.PLAYLENS_STORAGE_DIR;

try {
  process.env.PLAYLENS_STORAGE_DIR = storageRoot;
  const scope = initProjectScope(tempRoot);
  assert.equal(scope.created, true);
  assert.match(scope.configPath, /\.playlens\/project\.json$/);

  const demoRoot = join(tempRoot, "demo-scripts");
  mkdirSync(demoRoot, { recursive: true });
  writeFileSync(join(demoRoot, "playwright.config.cjs"), "module.exports = {};\n");
  writeFileSync(
    join(demoRoot, "package.json"),
    JSON.stringify({
      name: "demo-scripts",
      private: true,
      scripts: {
        "demo:pass": "node src/checkout-pass.cjs",
        "demo:fail": "node src/checkout-failure.cjs",
        "demo:no-playwright": "node src/no-playwright.cjs"
      },
      devDependencies: {
        "@playwright/test": "^1.0.0"
      }
    }, null, 2)
  );
  const detected = detectProject(demoRoot);
  assert.deepEqual(
    detected.npmScripts.sort(),
    ["demo:fail", "demo:no-playwright", "demo:pass"].sort(),
    "Playwright project detection should report demo scripts by script name and project context"
  );

  const result = await runSupervisedCommand({
    cwd: tempRoot,
    storageRoot,
    command: [
      process.execPath,
      "-e",
      "try { require('playwright') } catch { console.log('missing playwright is fine') } setTimeout(() => {}, 1200)"
    ]
  });

  assert.equal(result.exitCode, 0);
  const store = new RecorderStore(storageRoot);
  const sessions = store.listSessions();
  assert.equal(sessions.length, 1);
  const events = store.readEvents(sessions[0]);
  assert.ok(events.some((event) => event.kind === "process.started"));
  assert.ok(events.some((event) => event.kind === "terminal.output"));
  assert.ok(events.some((event) => event.kind === "playwright.detected"));
  assert.ok(events.some((event) => event.kind === "system.metric"), "supervised runs should emit system metric samples");
  assert.equal(sessions[0].manifest.status, "completed");

  const exported = await createSessionExport("json", createEmptyAppState(), { projectRoot: tempRoot });
  const exportedPayload = JSON.parse(exported.content) as { state: { sessions: unknown[]; events: Array<{ kind: string }> } };
  assert.equal(exportedPayload.state.sessions.length, 1);
  assert.ok(exportedPayload.state.events.some((event) => event.kind === "playwright.detected"));
  assert.ok(exportedPayload.state.events.some((event) => event.kind === "system.metric"));

  const staleExported = await createSessionExport("json", createInitialAppState(), { projectRoot: tempRoot }, { replaceTasksFromSessions: true });
  const stalePayload = JSON.parse(staleExported.content) as { state: { tasks: Array<{ name: string }>; sessions: unknown[]; events: Array<{ kind: string }> } };
  assert.equal(stalePayload.state.sessions.length, 1, "recording-backed exports should include real sessions");
  assert.equal(stalePayload.state.tasks.length, 1, "recording-backed exports should not include stale UI tasks");
  assert.equal(stalePayload.state.tasks[0].name.includes("Checkout"), false, "recording-backed exports should not leak demo task names");

  console.log("PlayLens recorder tests passed.");
} finally {
  if (originalStorage === undefined) {
    delete process.env.PLAYLENS_STORAGE_DIR;
  } else {
    process.env.PLAYLENS_STORAGE_DIR = originalStorage;
  }
  rmSync(tempRoot, { recursive: true, force: true });
}
