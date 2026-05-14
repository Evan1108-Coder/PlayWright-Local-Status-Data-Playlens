import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initProjectScope } from "../recorder/projectScope";
import { runSupervisedCommand } from "../recorder/supervisor";
import { RecorderStore } from "../recorder/storage";

const tempRoot = mkdtempSync(join(tmpdir(), "playlens-recorder-"));
const storageRoot = join(tempRoot, ".playlens", "sessions");
const originalStorage = process.env.PLAYLENS_STORAGE_DIR;

try {
  process.env.PLAYLENS_STORAGE_DIR = storageRoot;
  const scope = initProjectScope(tempRoot);
  assert.equal(scope.created, true);
  assert.match(scope.configPath, /\.playlens\/project\.json$/);

  const result = await runSupervisedCommand({
    cwd: tempRoot,
    storageRoot,
    command: [
      process.execPath,
      "-e",
      "try { require('playwright') } catch { console.log('missing playwright is fine') }"
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
  assert.equal(sessions[0].manifest.status, "completed");

  console.log("PlayLens recorder tests passed.");
} finally {
  if (originalStorage === undefined) {
    delete process.env.PLAYLENS_STORAGE_DIR;
  } else {
    process.env.PLAYLENS_STORAGE_DIR = originalStorage;
  }
  rmSync(tempRoot, { recursive: true, force: true });
}
