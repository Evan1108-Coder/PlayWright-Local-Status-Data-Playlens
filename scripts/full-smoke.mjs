import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { PlayLensClient } from "../src/sdk/client.ts";
import { createPlayLensServer } from "../src/server/server.ts";

const execFileAsync = promisify(execFile);
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const tsxBin = path.join(root, "node_modules", ".bin", "tsx");
const cliPath = path.join(root, "src", "cli", "playlens.ts");
const cli = [tsxBin, cliPath];

async function run(command, args, cwd = root) {
  return execFileAsync(command, args, {
    cwd,
    env: {
      ...process.env,
      PLAYLENS_STORAGE_DIR: path.join(cwd, ".playlens", "sessions")
    }
  });
}

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "playlens-full-smoke-"));
  const usesPlaywright = path.join(tempRoot, "uses-playwright");
  const noPlaywright = path.join(tempRoot, "no-playwright");
  await createFixtures(usesPlaywright, noPlaywright);

  const server = createPlayLensServer({ projectRoot: tempRoot });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    await run(cli[0], [cli[1], "init", "."], usesPlaywright);
    await run(cli[0], [cli[1], "init", "."], noPlaywright);

    const playwrightRun = await run(cli[0], [cli[1], "run", "--", "node", "smoke-playwright.cjs"], usesPlaywright);
    const noPlaywrightRun = await run(cli[0], [cli[1], "run", "--", "node", "smoke-no-playwright.cjs"], noPlaywright);

    assert.match(playwrightRun.stdout, /PlayLens session:/, "playwright fixture should produce a PlayLens session");
    assert.match(noPlaywrightRun.stdout, /PlayLens session:/, "non-playwright fixture should still produce supervised task shell");

    const playwrightEvents = await readAllEvents(path.join(usesPlaywright, ".playlens", "sessions"));
    const plainEvents = await readAllEvents(path.join(noPlaywright, ".playlens", "sessions"));

    assert.equal(
      playwrightEvents.some((event) => event.kind === "playwright.detected"),
      true,
      "playwright fixture should emit playwright.detected"
    );
    assert.equal(
      plainEvents.some((event) => event.kind === "playwright.detected"),
      false,
      "non-playwright fixture should not emit playwright.detected"
    );

    const jsonExport = await run(cli[0], [cli[1], "export", "--format", "json"], usesPlaywright);
    const ndjsonExport = await run(cli[0], [cli[1], "export", "--format", "ndjson"], usesPlaywright);
    const markdownExport = await run(cli[0], [cli[1], "export", "--format", "markdown"], usesPlaywright);
    assert.doesNotThrow(() => JSON.parse(jsonExport.stdout), "json export should parse");
    assert.match(ndjsonExport.stdout, /playwright.detected/, "ndjson export should include detected event");
    assert.match(markdownExport.stdout, /PlayLens Export/, "markdown export should render report");

    const address = server.address();
    assert.equal(typeof address, "object", "test server should expose an address object");
    const client = new PlayLensClient({ baseUrl: `http://127.0.0.1:${address.port}` });
    const health = await client.health();
    assert.equal(health.ok, true, "SDK health should reach backend");
    const sessions = await client.listSessions();
    assert.equal(Array.isArray(sessions), true, "SDK sessions should be an array");
  } finally {
    server.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }

  console.log("PlayLens full smoke passed.");
}

async function createFixtures(usesPlaywright, noPlaywright) {
  await fs.mkdir(path.join(usesPlaywright, "node_modules", "playwright"), { recursive: true });
  await fs.mkdir(noPlaywright, { recursive: true });
  await fs.writeFile(
    path.join(usesPlaywright, "package.json"),
    JSON.stringify({ name: "uses-playwright", private: true }, null, 2)
  );
  await fs.writeFile(
    path.join(usesPlaywright, "smoke-playwright.cjs"),
    "const { chromium } = require('playwright'); console.log('loaded', typeof chromium.launch); console.error('simulated stderr');\n"
  );
  await fs.writeFile(
    path.join(usesPlaywright, "node_modules", "playwright", "package.json"),
    JSON.stringify({ name: "playwright", version: "0.0.0", main: "index.js" }, null, 2)
  );
  await fs.writeFile(
    path.join(usesPlaywright, "node_modules", "playwright", "index.js"),
    "exports.chromium = { async launch() {} };\n"
  );
  await fs.writeFile(
    path.join(noPlaywright, "package.json"),
    JSON.stringify({ name: "no-playwright", private: true }, null, 2)
  );
  await fs.writeFile(
    path.join(noPlaywright, "smoke-no-playwright.cjs"),
    "console.log('normal node program, no playwright import');\n"
  );
}

async function readAllEvents(storageRoot) {
  const entries = await fs.readdir(storageRoot, { withFileTypes: true });
  const events = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const filePath = path.join(storageRoot, entry.name, "events.ndjson");
    const content = await fs.readFile(filePath, "utf8");
    for (const line of content.split("\n").filter(Boolean)) {
      events.push(JSON.parse(line));
    }
  }
  return events;
}

await main();
