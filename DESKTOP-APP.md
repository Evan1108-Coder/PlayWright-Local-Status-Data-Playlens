# PlayLens Desktop App

## Quick Start

Download the latest installer from [GitHub Releases](https://github.com/Evan1108-Coder/PlayWright-Local-Status-Data-Playlens/releases):

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `PlayLens-1.0.0-arm64.dmg` |
| macOS (Intel) | `PlayLens-1.0.0.dmg` |
| Windows | `PlayLens Setup 1.0.0.exe` |

## macOS Installation

1. Download the `.dmg` file for your Mac (Apple Silicon = M1/M2/M3/M4, Intel = older Macs).
2. Open the `.dmg` and drag **PlayLens** into your **Applications** folder.
3. Double-click **PlayLens** in Applications to launch.

### macOS Gatekeeper Warning

Since the app is not notarized, macOS may block it on first launch:

**"PlayLens" can't be opened because Apple cannot check it for malicious software.**

To fix this:

```bash
# Remove the quarantine flag
sudo xattr -rd com.apple.quarantine /Applications/PlayLens.app
```

Or: **System Settings → Privacy & Security → Open Anyway** (scroll down after the blocked launch attempt).

## Windows Installation

1. Download `PlayLens Setup 1.0.0.exe`.
2. Run the installer. If Windows SmartScreen appears, click **More info → Run anyway**.
3. Choose your installation directory (or use the default).
4. Launch PlayLens from the desktop shortcut or Start Menu.

## How It Works

The desktop app bundles everything needed to run PlayLens locally:

1. **API Server** — Starts automatically on `127.0.0.1:4174`
2. **Frontend** — Served on `127.0.0.1:5173`
3. **Data Storage** — Session data stored in `.playlens-data/` relative to project roots

When you launch PlayLens, a splash screen shows while servers start (typically 2-3 seconds). The main window opens once everything is ready.

## Using With Playwright

To record Playwright sessions into PlayLens:

1. Open PlayLens (the app must be running for the API to be available).
2. In your Playwright project folder, initialize PlayLens:
   ```bash
   npx playlens init .
   ```
3. Run your tests through PlayLens:
   ```bash
   npx playlens run -- npx playwright test
   ```
4. Switch back to the PlayLens app to view results in real time.

## Data Location

- **macOS**: Session data is stored relative to your project in `.playlens-data/`
- **Windows**: Same — `.playlens-data/` in your project folder
- **App settings**: Stored via the PlayLens API in the data directory

## Troubleshooting

### App won't open (macOS)

Run the xattr command from the Gatekeeper section above. If the app bounces in the dock but doesn't open:

```bash
sudo xattr -rd com.apple.quarantine /Applications/PlayLens.app
# If that doesn't work, try granting Full Disk Access:
# System Settings → Privacy & Security → Full Disk Access → Add PlayLens
```

### App shows "Starting server..." indefinitely

The API server may have failed to start. Check if port 4174 is already in use:

```bash
lsof -i :4174
# Kill any existing process on that port
kill -9 <PID>
```

Then relaunch PlayLens.

### Windows: "Windows protected your PC"

Click **More info** → **Run anyway**. This appears because the app is not code-signed.

### Blank white screen after launch

This usually means the frontend server didn't start. Quit and relaunch. If the issue persists, check if port 5173 is in use:

```bash
# macOS/Linux
lsof -i :5173
# Windows
netstat -ano | findstr :5173
```

## Building From Source

If you want to build the desktop app yourself:

```bash
# 1. Clone the repo
git clone https://github.com/Evan1108-Coder/PlayWright-Local-Status-Data-Playlens.git
cd PlayWright-Local-Status-Data-Playlens

# 2. Install project dependencies
npm install

# 3. Install Electron dependencies
cd electron
npm install

# 4. Build for your platform
npm run build:mac    # macOS (both arm64 + x64)
npm run build:win    # Windows
npm run build:all    # All platforms

# Installers output to ../dist-electron/
```

### Development mode

```bash
# From the project root:
npm install

# From the electron/ directory:
cd electron
npm install
npm run dev
```

This launches Electron in dev mode with hot-reload (Vite dev server) for the frontend.
