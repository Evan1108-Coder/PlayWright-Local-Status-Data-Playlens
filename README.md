# PlayLens

PlayLens is a local-first observability dashboard for Playwright runs. It captures tasks, browser/runtime events, terminal output, network-style evidence, settings, exports, and AI-agent-ready context so developers can inspect and share automation sessions.

## What Is Included

- React + Vite + TypeScript dashboard.
- Node backend API for health, state, sessions, and exports.
- CLI supervisor for recording command runs.
- Runtime hook that detects `playwright` and `@playwright/test` imports.
- Playwright reporter shape for test lifecycle events.
- Local filesystem storage and JSON/NDJSON/Markdown exports.
- SDK client shape for consuming PlayLens data in code.
- AI operator panel that stays disabled until a MiniMax API key is configured.
- Demo project under `demo-projects/payment-checkout-playwright-demo`.

## Quick Start

Install dependencies:

```bash
npm install
```

Start the backend:

```bash
npm run api
```

Start the dashboard in another terminal:

```bash
npm run dev -- --port 5174
```

Open:

```text
http://127.0.0.1:5174/
```

## Try The Demo

```bash
cd demo-projects/payment-checkout-playwright-demo
npm install
cd ../..
npm run playlens -- init demo-projects/payment-checkout-playwright-demo
cd demo-projects/payment-checkout-playwright-demo
../../node_modules/.bin/tsx ../../src/cli/playlens.ts run -- npm run demo:fail
```

Export captured data:

```bash
../../node_modules/.bin/tsx ../../src/cli/playlens.ts export --format markdown
../../node_modules/.bin/tsx ../../src/cli/playlens.ts export --format json
../../node_modules/.bin/tsx ../../src/cli/playlens.ts export --format ndjson
```

The demo uses a local Playwright stub, so it proves detection without downloading real browsers.

## AI

AI features are optional. If no MiniMax API key is provided, PlayLens continues working and the AI panel shows an unavailable state.

To enable AI later, create `.env`:

```text
VITE_MINIMAX_API_KEY=your_key_here
VITE_PLAYLENS_API_BASE=http://127.0.0.1:4174
```

Do not commit `.env`.

## Verification

```bash
npm run lint
npm run test
npm run build
```

