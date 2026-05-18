import type { SettingGroup, SettingItem, SettingValue } from "../data/types";

const REQUIRED_GROUPS = [
  ["tasks", "Tasks", "Task naming, grouping, pinning, auto-archive, and parallel task limits."],
  ["dashboard", "Dashboard", "Panel sizes, visible tabs, default views, graph density, and highlight duration."],
  ["local-api", "Local API", "Local-only API, SDK access, endpoint exposure, CORS, exports, and integration safeguards."],
  ["data-history", "Data & History", "Retention, cleanup, exports, session history, artifacts, and reset controls."],
  ["ai-file-uploads", "AI File Uploads", "Allowed files, upload limits, PDF extraction, and MiniMax file reading."],
  ["integrations", "Integrations", "Playwright reporter, CLI supervisor, shell hook, VS Code, CI, plugins, and webhooks."],
  ["system", "System", "Daemon status, ports, diagnostics, update channel, CPU and memory overhead."],
  ["advanced", "Advanced", "Raw config, analyzer toggles, schema version, debug mode, and experiments."],
] as const;

export function ensureCompleteSettingsGroups(groups: SettingGroup[]): SettingGroup[] {
  const existingIds = new Set(groups.map((group) => group.id));
  const supplemental = REQUIRED_GROUPS
    .filter(([id]) => !existingIds.has(id))
    .map(([id, label, description]) => ({
      id,
      label,
      description,
      items: supplementalItems(id),
    }));
  return [...groups, ...supplemental];
}

function supplementalItems(groupId: string): SettingItem[] {
  const make = (suffix: string, label: string, description: string, value: SettingValue, control: SettingItem["control"] = "text"): SettingItem => ({
    id: `setting-${groupId}-${suffix}` as SettingItem["id"],
    path: `${groupId}.${suffix}`,
    label,
    description,
    value,
    defaultValue: value,
    control,
    keywords: [groupId, suffix, label.toLowerCase()],
  });

  const byGroup: Record<string, SettingItem[]> = {
    tasks: [
      make("naming", "Task naming template", "Default names for file, command, and test-created tasks.", "Entry file + status", "text"),
      make("max-parallel", "Maximum parallel tracked tasks", "Limit simultaneous running and waiting task cards.", 24, "number"),
      make("pin-failed", "Keep failed tasks pinned", "Failed tasks remain visible until dismissed or archived.", true, "toggle"),
    ],
    dashboard: [
      make("default-view", "Default view", "First view opened for a selected task.", "Failure Investigation", "text"),
      make("highlight-duration", "Search highlight duration", "How long jumped-to rows glow after a search click.", 10, "number"),
    ],
    "local-api": [
      make("enabled", "Enable local API", "Expose PlayLens data through the local HTTP API when the backend server is running.", true, "toggle"),
      make("host", "Bind host", "Network interface used by the local API. 127.0.0.1 keeps it on this device.", "127.0.0.1", "text"),
      make("port", "Port", "HTTP port used by dashboard, SDK, and custom local integrations.", 4174, "number"),
      make("cors", "Allow local CORS", "Allow browser tools on localhost and 127.0.0.1 to read the API.", true, "toggle"),
      make("write-access", "Allow write endpoints", "Enable local code to update settings and project scopes through the API.", true, "toggle"),
      make("artifact-access", "Allow artifact reads", "Allow local code to read screenshots, traces, and attachments through artifact URLs.", true, "toggle"),
      make("default-event-limit", "Default event limit", "Default maximum events returned to UI and SDK calls when a limit is not specified.", 500, "number"),
      make("max-response-mb", "Max response size", "Warn before very large JSON responses are served to local integrations.", 25, "number"),
      make("include-ai-history", "Include AI history", "Expose AI chat messages in local API state, search, and exports when enabled.", true, "toggle"),
      make("include-terminal", "Include terminal output", "Expose supervised stdout and stderr records through events and exports.", true, "toggle"),
      make("redact-secrets", "Redact secrets", "Redact obvious tokens, authorization headers, and API keys before local API responses.", true, "toggle"),
      make("schema-version", "Schema version", "Stable schema version advertised through /api/manifest.", "2026.05-local", "text"),
    ],
    "data-history": [
      make("retention", "Retention policy", "Automatically clean old sessions, logs, artifacts, and indexes.", "90 days", "text"),
      make("max-disk", "Maximum disk usage", "Warn or prune when recordings exceed this local storage budget.", 20, "number"),
    ],
    "ai-file-uploads": [
      make("enabled", "Enable AI file uploads", "Allow files in AI conversations and analysis tasks.", true, "toggle"),
      make("allowed", "Allowed file types", "txt, md, csv, json, html, pdf, png, jpg, and jpeg.", ".txt, .md, .csv, .json, .html, .pdf, .png, .jpg, .jpeg", "text"),
    ],
    integrations: [
      make("reporter", "Playwright reporter", "Capture test lifecycle, retries, attachments, projects, and assertions.", true, "toggle"),
      make("shell-hook", "Shell hook", "Automatically supervise commands launched inside watched folders.", false, "toggle"),
    ],
    system: [
      make("daemon", "Recorder daemon", "Background process for folder watching and local capture coordination.", "Running", "text"),
      make("port", "Local API port", "Port used by dashboard, recorder, SDK, and local integrations.", 4174, "number"),
    ],
    advanced: [
      make("schema", "Event schema version", "Version used by event streams, SDK, exports, and replay indexing.", "2026.05-alpha", "text"),
      make("debug", "Debug mode", "Increase recorder logs and show internal state panels.", false, "toggle"),
    ],
  };

  return byGroup[groupId] ?? [];
}
