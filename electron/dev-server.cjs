const { spawn } = require("child_process");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const env = { ...process.env };

const apiProcess = spawn("npx", ["tsx", "src/server/server.ts"], {
  cwd: projectRoot,
  env: { ...env, PLAYLENS_API_PORT: env.PLAYLENS_API_PORT || "4174", PLAYLENS_API_HOST: "127.0.0.1" },
  stdio: ["ignore", "pipe", "pipe"],
  shell: true,
  windowsHide: true,
});

apiProcess.stdout.on("data", (d) => process.stdout.write(`[api] ${d}`));
apiProcess.stderr.on("data", (d) => process.stderr.write(`[api] ${d}`));

const viteProcess = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", env.PLAYLENS_FRONTEND_PORT || "5173"], {
  cwd: projectRoot,
  env,
  stdio: ["ignore", "pipe", "pipe"],
  shell: true,
  windowsHide: true,
});

viteProcess.stdout.on("data", (d) => process.stdout.write(`[vite] ${d}`));
viteProcess.stderr.on("data", (d) => process.stderr.write(`[vite] ${d}`));

process.on("SIGTERM", () => {
  apiProcess.kill("SIGTERM");
  viteProcess.kill("SIGTERM");
  process.exit(0);
});

process.on("exit", () => {
  try { apiProcess.kill(); } catch (_) {}
  try { viteProcess.kill(); } catch (_) {}
});
