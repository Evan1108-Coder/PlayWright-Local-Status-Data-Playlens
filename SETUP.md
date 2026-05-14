# PlayLens Setup Guide

## Prerequisites

- **Node.js** >= 22.x (tested with 22.11.0)
- **npm** >= 10.x
- A terminal (macOS, Linux, or Windows with WSL)

## Installation

1. Clone the repository:

```bash
git clone https://github.com/Evan1108-Coder/PlayWright-Local-Status-Data-Playlens.git
cd PlayWright-Local-Status-Data-Playlens
```

2. Install dependencies:

```bash
npm install
```

3. (Optional) Configure AI features — see `ENV.md` for details:

```bash
cp .env.example .env
# Edit .env and add your MiniMax API key
```

## Running the Application

### Start the backend API server

```bash
npm run api
```

This starts the Node HTTP server on `http://127.0.0.1:4174`.

### Start the frontend dashboard

In a separate terminal:

```bash
npm run dev
```

This starts the Vite dev server on `http://127.0.0.1:5173`.

### Open the dashboard

Navigate to `http://127.0.0.1:5173` in your browser.

## Verification

Run these commands to verify the installation:

```bash
# Type-check
npm run lint

# Run all unit tests
npm run test

# Run the full smoke test
npm run test:smoke

# Build for production
npm run build
```

## Using the CLI

PlayLens includes a CLI for managing projects and recordings:

```bash
# Initialize a project folder
npm run playlens -- init /path/to/your/playwright/project

# Run a command under PlayLens supervision
npm run playlens -- run -- npm test

# Export recorded data
npm run playlens -- export --format json
npm run playlens -- export --format markdown
npm run playlens -- export --format ndjson

# Check system health
npm run playlens -- doctor

# Show help
npm run playlens -- help
```

## Try the Demo Project

```bash
cd demo-projects/payment-checkout-playwright-demo
npm install
cd ../..
npm run playlens -- init demo-projects/payment-checkout-playwright-demo
cd demo-projects/payment-checkout-playwright-demo
../../node_modules/.bin/tsx ../../src/cli/playlens.ts run -- npm run demo:fail
```

## Architecture Overview

| Component | Location | Description |
|-----------|----------|-------------|
| Dashboard | `src/components/` | React 19 + TypeScript UI |
| Backend API | `src/server/` | Node HTTP server (port 4174) |
| CLI | `src/cli/` | Command-line interface |
| Recorder | `src/recorder/` | Process supervisor, Playwright reporter, runtime hook |
| SDK | `src/sdk/` | Programmatic client for consuming PlayLens data |
| AI Agent | `src/agent/` | MiniMax-backed AI operator (optional) |
| Storage | `src/storage/` | File-based session storage in `.playlens-data/` |
| Exporters | `src/exporters/` | JSON, NDJSON, Markdown export formatters |
| Styles | `src/styles/` | Dark theme CSS |
| Tests | `src/tests/` | Unit tests (logic, agent, recorder, minimax) |
| Scripts | `scripts/` | Full smoke test runner |

## Next Steps

- Read `README.md` for a project overview
- Read `ENV.md` for environment variable configuration
- Read `TROUBLESHOOTING.md` if you encounter issues
