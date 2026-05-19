const { app, BrowserWindow, dialog, shell, Menu } = require("electron");
const { spawn, execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const net = require("net");
const http = require("http");

const API_PORT = 4174;
const FRONTEND_PORT = 5173;

let mainWindow = null;
let serverProcess = null;
let splashWindow = null;

const projectRoot = app.isPackaged
  ? path.join(process.resourcesPath, "app-content")
  : path.resolve(__dirname, "..");

function getEnhancedEnv() {
  const env = { ...process.env };
  if (process.platform === "darwin") {
    const extraPaths = [
      "/opt/homebrew/bin",
      "/opt/homebrew/sbin",
      "/usr/local/bin",
      "/usr/local/sbin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
    ];
    const nvmDir = path.join(process.env.HOME || "", ".nvm/versions/node");
    try {
      const versions = fs.readdirSync(nvmDir);
      if (versions.length > 0) {
        versions.sort().reverse();
        extraPaths.unshift(path.join(nvmDir, versions[0], "bin"));
      }
    } catch (_) {}
    const currentPath = env.PATH || "/usr/bin:/bin:/usr/sbin:/sbin";
    const pathSet = new Set(currentPath.split(":"));
    for (const p of extraPaths) {
      pathSet.add(p);
    }
    env.PATH = Array.from(pathSet).join(":");
  }
  return env;
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(true));
    server.once("listening", () => {
      server.close();
      resolve(false);
    });
    server.listen(port, "127.0.0.1");
  });
}

function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error(`Server at ${url} did not respond within ${timeoutMs / 1000}s`));
        return;
      }
      http
        .get(url, (res) => {
          if (res.statusCode === 200) {
            resolve();
          } else {
            setTimeout(check, 300);
          }
        })
        .on("error", () => {
          setTimeout(check, 300);
        });
    };
    check();
  });
}

function updateSplashStatus(text) {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  splashWindow.webContents
    .executeJavaScript(
      `document.querySelector('.status').textContent = ${JSON.stringify(text)}`
    )
    .catch(() => {});
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
    splashWindow = null;
  }
}

async function showErrorAndQuit(title, message) {
  closeSplash();
  await dialog.showMessageBox({
    type: "error",
    title,
    message,
    buttons: ["Quit"],
  });
  cleanup();
  app.quit();
}

function createSplashWindow() {
  const isMac = process.platform === "darwin";

  splashWindow = new BrowserWindow({
    width: 420,
    height: 320,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  splashWindow.on("close", () => {
    if (mainWindow === null) {
      cleanup();
      app.quit();
    }
  });

  const splashHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          background: transparent;
          -webkit-app-region: drag;
        }
        .splash {
          background: rgba(12, 14, 20, 0.96);
          backdrop-filter: blur(40px) saturate(1.8);
          -webkit-backdrop-filter: blur(40px) saturate(1.8);
          border-radius: 24px;
          padding: 48px 40px 40px;
          text-align: center;
          border: 1px solid rgba(56, 189, 248, 0.15);
          box-shadow: 0 32px 64px rgba(0, 0, 0, 0.6), 0 0 40px rgba(56, 189, 248, 0.08);
          width: 380px;
          position: relative;
        }
        .close-btn {
          display: flex;
          position: absolute;
          top: 12px;
          ${isMac ? "left: 14px;" : "right: 12px;"}
          width: ${isMac ? "14px" : "28px"};
          height: ${isMac ? "14px" : "28px"};
          align-items: center;
          justify-content: center;
          border-radius: ${isMac ? "50%" : "6px"};
          border: none;
          background: ${isMac ? "rgba(255, 90, 95, 0.85)" : "rgba(255, 255, 255, 0.08)"};
          color: ${isMac ? "transparent" : "rgba(255, 255, 255, 0.6)"};
          font-size: ${isMac ? "10px" : "16px"};
          cursor: pointer;
          -webkit-app-region: no-drag;
          transition: background 0.15s, color 0.15s;
        }
        .close-btn:hover { background: ${isMac ? "rgba(255, 70, 75, 1)" : "rgba(232, 17, 35, 0.9)"}; color: ${isMac ? "rgba(80,0,0,0.7)" : "#fff"}; }
        .icon {
          font-size: 52px;
          margin-bottom: 16px;
          filter: drop-shadow(0 0 20px rgba(56, 189, 248, 0.4));
        }
        h1 {
          color: #fff;
          font-size: 20px;
          font-weight: 600;
          letter-spacing: -0.3px;
          margin-bottom: 8px;
          background: linear-gradient(135deg, #38bdf8, #a78bfa);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .status {
          color: rgba(255, 255, 255, 0.45);
          font-size: 13px;
          margin-bottom: 24px;
          transition: opacity 0.2s;
        }
        .loader {
          width: 200px;
          height: 3px;
          background: rgba(255, 255, 255, 0.06);
          border-radius: 2px;
          margin: 0 auto;
          overflow: hidden;
        }
        .loader-bar {
          height: 100%;
          width: 40%;
          background: linear-gradient(90deg, rgba(56, 189, 248, 0.7), rgba(167, 139, 250, 0.7));
          border-radius: 2px;
          animation: slide 1.5s ease-in-out infinite;
        }
        @keyframes slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
      </style>
    </head>
    <body>
      <div class="splash">
        <button class="close-btn" onclick="window.close()">\u00D7</button>
        <div class="icon">\u{1F50D}</div>
        <h1>PlayLens</h1>
        <p class="status">Starting server\u2026</p>
        <div class="loader"><div class="loader-bar"></div></div>
      </div>
    </body>
    </html>
  `;

  splashWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`
  );
}

function createMainWindow() {
  const isMac = process.platform === "darwin";

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    ...(isMac
      ? { titleBarStyle: "hiddenInset", trafficLightPosition: { x: 16, y: 16 } }
      : {}),
    backgroundColor: "#0c0e14",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${FRONTEND_PORT}`);

  mainWindow.webContents.once("did-finish-load", () => {
    if (!mainWindow) return;
    closeSplash();
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function buildAppMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? [{ type: "separator" }, { role: "front" }]
          : [{ role: "close" }]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function findNodeBinary() {
  if (app.isPackaged) {
    return process.execPath;
  }
  const env = getEnhancedEnv();
  const candidates = process.platform === "win32"
    ? ["node.exe", "node"]
    : ["node"];
  for (const cmd of candidates) {
    try {
      execFileSync(cmd, ["--version"], { env, timeout: 5000, encoding: "utf8", windowsHide: true });
      return cmd;
    } catch (_) {}
  }
  return "node";
}

async function startServer() {
  const apiInUse = await isPortInUse(API_PORT);
  const frontendInUse = await isPortInUse(FRONTEND_PORT);
  if (apiInUse && frontendInUse) {
    console.log("Both ports already in use, assuming servers are running");
    return;
  }

  const env = {
    ...getEnhancedEnv(),
    PLAYLENS_API_PORT: String(API_PORT),
    PLAYLENS_API_HOST: "127.0.0.1",
    PLAYLENS_FRONTEND_PORT: String(FRONTEND_PORT),
    PLAYLENS_FRONTEND_HOST: "127.0.0.1",
    NODE_ENV: "production",
  };

  if (app.isPackaged) {
    env.ELECTRON_RUN_AS_NODE = "1";
    env.PLAYLENS_STATIC_DIR = path.join(projectRoot, "frontend-dist");
  }

  const serverScript = app.isPackaged
    ? path.join(projectRoot, "app-server.cjs")
    : path.join(projectRoot, "electron", "dev-server.cjs");

  const nodeBin = app.isPackaged ? process.execPath : findNodeBinary();

  return new Promise((resolve, reject) => {
    serverProcess = spawn(nodeBin, [serverScript], {
      cwd: projectRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    serverProcess.stdout.on("data", (data) => {
      process.stdout.write(`[server] ${data}`);
    });
    serverProcess.stderr.on("data", (data) => {
      process.stderr.write(`[server] ${data}`);
    });
    serverProcess.on("error", (err) => {
      reject(new Error(`Server failed to start: ${err.message}`));
    });
    serverProcess.on("exit", (code) => {
      console.log(`Server exited with code ${code}`);
      serverProcess = null;
    });

    resolve();
  });
}

function stopProcess(proc) {
  if (!proc || proc.killed) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(proc.pid), "/f", "/t"], {
        windowsHide: true,
      });
    } else {
      proc.kill("SIGTERM");
    }
  } catch (e) {
    console.error("Error stopping process:", e.message);
  }
}

function cleanup() {
  stopProcess(serverProcess);
}

app.on("ready", async () => {
  buildAppMenu();
  createSplashWindow();

  try {
    updateSplashStatus("Starting PlayLens server\u2026");
    await startServer();

    updateSplashStatus("Waiting for API server\u2026");
    await waitForServer(`http://127.0.0.1:${API_PORT}/api/health`, 30000);
    console.log("API server is ready.");

    updateSplashStatus("Waiting for frontend\u2026");
    await waitForServer(`http://127.0.0.1:${FRONTEND_PORT}`, 30000);
    console.log("Frontend is ready.");

    updateSplashStatus("Loading PlayLens\u2026");
    createMainWindow();
  } catch (err) {
    console.error("Startup error:", err);
    await showErrorAndQuit(
      "Startup Error",
      `Failed to start PlayLens:\n\n${err.message}`
    );
  }
});

app.on("window-all-closed", () => {
  cleanup();
  app.quit();
});

app.on("before-quit", () => {
  cleanup();
});

app.on("activate", () => {
  if (mainWindow === null && serverProcess) {
    createMainWindow();
  }
});
