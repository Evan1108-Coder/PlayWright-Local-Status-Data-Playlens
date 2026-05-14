# Build Plan

## Phase 1: Foundation

- Document product architecture.
- Define app types and mock data.
- Build dashboard prototype with professional UI.
- Build settings page with grouped settings and search.
- Build AI Agent panel with operator modes, activity, permissions, and file upload UI.
- Add state actions that prove settings, tasks, search, and AI controls sync together.

## Phase 2: Recording Prototype

- Add CLI supervisor shape.
- Add Playwright reporter shape.
- Add local project scope config generation.
- Store mock session events in the same shape the real recorder will emit.

## Phase 3: Real Capture

- Implement Playwright reporter.
- Implement runtime hooks.
- Capture network, console, page errors, DOM snapshots, screenshots, and terminal logs.
- Add real system metrics from Node where available.

## Phase 4: Agent Actions

- Connect MiniMax adapter.
- Add typed app tools.
- Add confirmation flows.
- Add file ingestion.
- Add audit log views.

## Phase 5: SDK And Exports

- Add local API.
- Add TypeScript SDK.
- Add JSON, NDJSON, HAR, Markdown, JUnit exports.
- Add plugin interface.

