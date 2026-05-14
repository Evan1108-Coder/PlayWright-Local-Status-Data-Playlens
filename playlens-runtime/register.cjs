const Module = require("node:module");

const originalLoad = Module._load;
const seen = new Set();

Module._load = function playlensLoadPatch(request, parent, isMain) {
  if ((request === "playwright" || request === "@playwright/test") && !seen.has(request)) {
    seen.add(request);
    const marker = {
      kind: "playwright.detected",
      severity: "info",
      title: "Playwright detected",
      message: `Required ${request}`,
      module: request,
      parent: parent && parent.filename,
      pid: process.pid,
      sessionId: process.env.PLAYLENS_SESSION_ID,
      taskId: process.env.PLAYLENS_TASK_ID,
      timestamp: new Date().toISOString()
    };
    process.stdout.write(`[PlayLens] ${JSON.stringify(marker)}\n`);
  }

  return originalLoad.apply(this, arguments);
};
