# PlayLens Architecture

PlayLens is a local-first browser automation observability and control platform for Playwright-powered programs. It records what the browser, test runner, terminal, operating system, network, DOM, and AI agent know into one linked session graph.

## Product Principle

A Playwright run becomes an append-only, queryable task/session timeline with linked artifacts, issues, metrics, and agent actions.

The UI is a professional investigation cockpit, but the data must also be usable from code through typed models, exports, API routes, and future SDK packages.

## Primary Layers

1. **Project Scope**
   - A local folder can be plugged into PlayLens.
   - The folder receives `.playlens/project.json`.
   - Files under that folder are treated as possible Playwright entry points.
   - Runs are only recorded deeply after Playwright is detected.

2. **Task Registry**
   - Tracks running, waiting, failed, completed, and archived tasks.
   - Handles parallel Playwright programs.
   - Owns task naming, renaming, grouping, status, and task-to-session relationships.

3. **Recorder Core**
   - CLI supervisor captures command lifecycle, stdout/stderr, process tree, CPU, memory, and exit status.
   - Playwright reporter captures test lifecycle, retries, attachments, and failure metadata.
   - Runtime hook captures browser/context/page/action lifecycle when possible.
   - Browser listeners capture network, console, page errors, dialogs, downloads, navigation, storage, and artifacts.

4. **Session Store**
   - Append-only event stream is source of truth.
   - Indexed metadata enables fast search, filters, graphs, and issue detection.
   - Artifacts are stored separately and linked by id.

5. **Analysis Engine**
   - Converts raw events into issues, causal chains, graph edges, reliability signals, and suggested next actions.
   - Supports pluggable analyzers.

6. **Settings Store**
   - Owns every setting.
   - UI, search, task logic, recorder logic, and AI agent all read/write through this layer.
   - Changes emit audit events and update dependent stores.

7. **AI Agent**
   - MiniMax-backed operator agent.
   - Disabled gracefully when no MiniMax API key is configured.
   - Can read recorded data, uploaded files, and app architecture metadata.
   - Can perform typed app actions based on permission mode.
   - Every mutation is audited.

8. **Dashboard UI**
   - Task switcher.
   - Timeline.
   - Browser replay/evidence panes.
   - Inspector.
   - Graph and table causal views.
   - Network/DOM/console/system views.
   - Local API page.
   - AI Agent.
   - Settings and global search.

## Source Of Truth Rule

No UI panel owns independent truth for important data.

When `PLAYLENS_STORAGE_DIR` points at a project-local `.playlens/sessions` directory, the backend treats that session stream as the source of truth for tasks, sessions, events, issues, current URLs, durations, and browser viewport metadata. The frontend starts from empty state, polls `/api/state`, and renders blank panels when no real recording exists instead of falling back to demo values.

Recorder-backed UI preferences, such as task renames and settings, are saved in app state without rewriting the append-only session manifests. Hydration merges matching task overrides over the recorder stream at read time. Stale app-state tasks, mock sessions, mock AI messages, and unrelated project scopes are excluded while `PLAYLENS_STORAGE_DIR` is active.

The live dashboard polls a compact state window so busy recordings stay responsive. This does not truncate the source data: append-only session files and export routes hydrate the full stream unless a UI-specific window is requested.

When no real sessions exist, the frontend derives a non-persisted `Blank` task with zero data. That task is only a UI placeholder; it is not exported as a real session and disappears as soon as a recording exists. AI controls stay disabled while only the blank task exists.

Examples:

- Renaming a task updates task list, header, search index, exports, AI context, audit log, and open tabs.
- Clearing AI history updates the AI panel, settings status, data store, search index, and audit log.
- Changing capture settings updates settings UI, recorder behavior, project config, and AI-readable configuration.

## Local Storage Plan

Default storage should avoid bloating user repositories.

Project folder:

```text
.playlens/
  project.json
```

App data storage:

```text
sessions/
  <session-id>/
    manifest.json
    events.ndjson
    session.sqlite
    artifacts/
      screenshots/
      dom/
      network/
      terminal/
      ai/
```

The current implementation serves linked image artifacts through `/api/artifact?sessionId=<id>&path=<artifact>`. Replay uses the selected event's image artifact first, then falls back to the latest image artifact in the session.

For running sessions, the dashboard follows the newest event so live artifacts can update in place. Historical sessions default to the most relevant action/issue event and stay stable until the user selects another event.

Clear Memory is intentionally destructive and scoped to the currently configured storage root. It removes session streams, image artifacts, exports, and saved state snapshots, then returns the UI to the derived `Blank` task.

Users may choose project-local storage from Settings.

## Local API And Public Data Access

The current implementation exposes a free local-only HTTP API on `127.0.0.1:4174` by default. It is intended for code running on the same device to consume PlayLens data without scraping the UI.

Current API access paths:

- TypeScript SDK through `PlayLensClient`.
- Local HTTP routes for health, manifest, tasks, sessions, events, issues, metrics, settings, search, artifacts, and exports.
- Raw/detail routes for saved state, hydrated state, raw session manifests, raw event files, storage file indexes, project scopes, audit logs, AI messages, uploaded-file metadata, and artifact indexes.
- JSON, NDJSON, and Markdown exports.
- CLI commands.

Key routes:

```text
GET /api/manifest
GET /api/tasks
GET /api/tasks/:taskId
GET /api/sessions
GET /api/sessions/:sessionId
GET /api/sessions/:sessionId/events
GET /api/events
GET /api/issues
GET /api/metrics
GET /api/settings
POST /api/settings
GET /api/project-scopes
GET /api/audit
GET /api/ai/messages
GET /api/uploads
GET /api/search?q=<query>
GET /api/export?format=json|ndjson|markdown
GET /api/artifacts
GET /api/raw/state
GET /api/raw/files/index
GET /api/raw/sessions
GET /api/raw/sessions/:sessionId/manifest
GET /api/raw/sessions/:sessionId/events
```

Future public access paths:

- HAR/JUnit exports.
- Analyzer plugins.
- AI context bundles.
