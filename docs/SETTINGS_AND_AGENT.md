# Settings And Agent Design

Settings is the control center for PlayLens. The dashboard exposes quick controls, but every durable preference lives in Settings.

## Settings Groups

1. General
2. Projects & Folders
3. Tasks
4. Capture
5. Runtime & Timeouts
6. Dashboard
7. Data & History
8. Privacy & Redaction
9. AI Agent
10. AI File Uploads
11. Integrations
12. System
13. Advanced

## Search Behavior

Global search should search settings, tasks, sessions, issues, network requests, console logs, terminal logs, AI chats, uploaded files, exports, and plugins.

Search results are colored links. Clicking a result opens the matching page, tab, panel, setting, row, or event. If the target is already on the current dashboard, PlayLens highlights the target for about ten seconds.

## AI Agent Modes

AI features are unavailable until a MiniMax API key is configured. The app must not break when the key is missing; it should show AI as disabled, keep the rest of PlayLens usable, and make AI-related settings pending until a key is provided.

- **Read Only**: inspect and explain.
- **Ask Before Acting**: propose actions and wait for approval.
- **Trusted Actions**: safe actions may run automatically.
- **Full Operator**: broad app operation, still requiring confirmation for dangerous actions.

Dangerous actions always require confirmation:

- delete history
- reset app
- remove watched folder
- clear all AI chats
- export sensitive data
- change storage mode
- disable privacy filters

## AI Capabilities

The agent can:

- inspect tasks, sessions, settings, architecture metadata, artifacts, logs, screenshots, DOM, network, console, terminal, and system metrics
- analyze failures and produce reports
- create and rename tasks
- add, pause, or remove watched folders according to permissions
- change settings
- create filters
- export data
- open dashboard views
- pause, stop, or resume its own task
- read uploaded files

The agent must call typed app actions instead of directly mutating UI internals.

```ts
agent.call("task.rename", { taskId: "task-1", name: "Payment Debug Run" });
agent.call("settings.update", { path: "capture.networkBodies", value: "failed-only" });
agent.call("dashboard.open", { view: "network", filter: "status >= 400" });
```

## Supported Upload Types

- `.txt`
- `.md`
- `.csv`
- `.json`
- `.html`
- `.pdf`
- `.png`
- `.jpg`
- `.jpeg`

Uploaded files are converted into normalized attachments. Text, tables, images, and extracted metadata are made available to MiniMax through the agent context layer.

## Chat Rendering

AI responses are rendered as rich content. Users should see formatted bold text, headings, lists, tables, links, dividers, code blocks, image references, and issue cards rather than raw Markdown markers.

## Audit Log

Every AI action creates an audit entry:

```text
AI changed Capture > Network Bodies from "off" to "failed-only"
User approved: yes
Reason: needed response body for failed payment request
```
