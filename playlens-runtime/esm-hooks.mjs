const seen = new Set();

export async function resolve(specifier, context, nextResolve) {
  if ((specifier === "playwright" || specifier === "@playwright/test") && !seen.has(specifier)) {
    seen.add(specifier);
    const marker = {
      kind: "playwright.detected",
      severity: "info",
      title: "Playwright detected (ESM)",
      message: `Imported ${specifier}`,
      module: specifier,
      parent: context.parentURL ?? null,
      pid: process.pid,
      sessionId: process.env.PLAYLENS_SESSION_ID,
      taskId: process.env.PLAYLENS_TASK_ID,
      timestamp: new Date().toISOString()
    };
    process.stdout.write(`[PlayLens] ${JSON.stringify(marker)}\n`);
  }
  return nextResolve(specifier, context);
}
