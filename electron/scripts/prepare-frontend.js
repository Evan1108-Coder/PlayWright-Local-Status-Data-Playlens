const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "../..");
const bundleDir = path.join(__dirname, "..", ".app-bundle");

console.log("=== PlayLens App Build ===");
console.log("Project root:", projectRoot);

// Step 1: Build the Vite frontend
console.log("\n[1/3] Building frontend with Vite...");
execSync("npm run build", { cwd: projectRoot, stdio: "inherit" });

// Step 2: Bundle the server with esbuild
console.log("\n[2/3] Bundling server with esbuild...");
execSync(
  `npx esbuild src/server/server.ts --bundle --platform=node --target=node18 --format=cjs --outfile="${path.join(bundleDir, "server-bundle.cjs")}" --external:playwright --external:@playwright/test --define:import.meta.url='"file://"'`,
  { cwd: projectRoot, stdio: "inherit" }
);

// Step 3: Copy frontend dist to bundle
console.log("\n[3/3] Copying frontend dist...");
const distDir = path.join(projectRoot, "dist");
const targetDistDir = path.join(bundleDir, "frontend-dist");

if (fs.existsSync(targetDistDir)) {
  fs.rmSync(targetDistDir, { recursive: true });
}
fs.cpSync(distDir, targetDistDir, { recursive: true });

// Create a production server wrapper that serves both API and static files
const prodServer = `
const http = require("http");
const fs = require("fs");
const path = require("path");

const staticDir = process.env.PLAYLENS_STATIC_DIR || path.join(__dirname, "frontend-dist");
const apiPort = parseInt(process.env.PLAYLENS_API_PORT || "4174", 10);
const frontendPort = parseInt(process.env.PLAYLENS_FRONTEND_PORT || "5173", 10);
const host = process.env.PLAYLENS_API_HOST || "127.0.0.1";

// Import the bundled server module
const serverModule = require("./server-bundle.cjs");

// Start the API server
const apiServer = serverModule.createPlayLensServer({ port: apiPort, host });
apiServer.listen(apiPort, host, () => {
  console.log("PlayLens API listening on " + host + ":" + apiPort);
});

// Start a static file server for the frontend
const MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
};

const frontendServer = http.createServer((req, res) => {
  let filePath = path.join(staticDir, req.url === "/" ? "index.html" : req.url.split("?")[0]);

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(staticDir, "index.html");
  }

  try {
    const content = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch (err) {
    res.writeHead(404);
    res.end("Not Found");
  }
});

frontendServer.listen(frontendPort, host, () => {
  console.log("PlayLens frontend listening on " + host + ":" + frontendPort);
});
`;

fs.writeFileSync(path.join(bundleDir, "app-server.cjs"), prodServer);

console.log("\n✓ Build complete. Bundle at:", bundleDir);
console.log("  - server-bundle.cjs (API server)");
console.log("  - app-server.cjs (production launcher)");
console.log("  - frontend-dist/ (static frontend)");
