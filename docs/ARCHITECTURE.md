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
   - Browser replay.
   - Inspector.
   - Graphs.
   - Network/DOM/console/system views.
   - AI Agent.
   - Settings and global search.

## Source Of Truth Rule

No UI panel owns independent truth for important data.

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

Users may choose project-local storage from Settings.

## Public Data Access

Future public access paths:

- TypeScript SDK.
- Local HTTP API.
- JSON/NDJSON/HAR/JUnit/Markdown exports.
- Analyzer plugins.
- AI context bundles.
- CLI commands.
