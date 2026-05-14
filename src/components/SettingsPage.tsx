import { FolderPlus, RotateCcw, Search, ShieldAlert, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { SettingId, SettingItem, SettingValue } from "../data/types";
import type { PlayLensState } from "../state/appState";

interface SettingsPageProps {
  state: PlayLensState;
  highlightTargetId: string | null;
  aiAvailable: boolean;
  onUpdateSetting: (settingId: SettingId, value: SettingValue) => void;
  onAddWatchedFolder: (folderPath: string) => void;
  onClearAIHistory: () => void;
}

const REQUIRED_GROUPS = [
  ["tasks", "Tasks", "Task naming, grouping, pinning, auto-archive, and parallel task limits."],
  ["dashboard", "Dashboard", "Panel sizes, visible tabs, default views, graph density, and highlight duration."],
  ["data-history", "Data & History", "Retention, cleanup, exports, session history, artifacts, and reset controls."],
  ["ai-file-uploads", "AI File Uploads", "Allowed files, upload limits, PDF extraction, and MiniMax file reading."],
  ["integrations", "Integrations", "Playwright reporter, CLI supervisor, shell hook, VS Code, CI, plugins, and webhooks."],
  ["system", "System", "Daemon status, ports, diagnostics, update channel, CPU and memory overhead."],
  ["advanced", "Advanced", "Raw config, analyzer toggles, schema version, debug mode, and experiments."],
] as const;

export function SettingsPage({ state, highlightTargetId, aiAvailable, onUpdateSetting, onAddWatchedFolder, onClearAIHistory }: SettingsPageProps) {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Record<string, SettingValue>>({});

  const groups = useMemo(() => {
    const existingIds = new Set(state.settingsGroups.map((group) => group.id));
    const supplemental = REQUIRED_GROUPS.filter(([id]) => !existingIds.has(id)).map(([id, label, description]) => ({
      id,
      label,
      description,
      items: supplementalItems(id),
    }));
    return [...state.settingsGroups, ...supplemental];
  }, [state.settingsGroups]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleGroups = useMemo(() => {
    if (!normalizedQuery) return groups;
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          [group.label, group.description, item.label, item.description, item.path, ...(item.keywords ?? [])]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, normalizedQuery]);

  const isHighlighted = (id: string) => highlightTargetId === id || Boolean(highlightTargetId && id.includes(highlightTargetId));

  return (
    <section className="settings-page">
      <div className="page-heading">
        <span className="section-kicker">Control Center</span>
        <h2>Settings</h2>
        <p>Every durable PlayLens preference lives here and syncs into the dashboard, recorder, search, exports, and AI agent.</p>
      </div>

      <div className="settings-toolbar">
        <label className="settings-search">
          <Search size={16} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search settings, timeout, AI, folders..." />
        </label>
        <button
          onClick={() => {
            const folder = window.prompt("Folder to plug into PlayLens", "/Users/example/Projects/new-playwright-app");
            if (folder) onAddWatchedFolder(folder);
          }}
        >
          <FolderPlus size={15} /> Add Folder
        </button>
        <button onClick={onClearAIHistory}><Trash2 size={15} /> Clear AI Chat</button>
        <button><RotateCcw size={15} /> Reset Layout</button>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings groups">
          {groups.map((group) => (
            <a key={group.id} className={isHighlighted(group.id) ? "highlight-target" : ""} href={`#${group.id}`}>
              {group.label}
            </a>
          ))}
        </nav>

        <div className="settings-groups">
          {!aiAvailable ? (
            <section className="settings-group ai-unavailable-note">
              <div className="settings-group-header">
                <h3>AI features unavailable</h3>
                <p>MiniMax API key is missing. AI settings can be edited and saved, but they only take effect after `VITE_MINIMAX_API_KEY` or `MINIMAX_API_KEY` is provided and PlayLens is restarted.</p>
              </div>
            </section>
          ) : null}

          <section className={`settings-group ${isHighlighted("projects") ? "highlight-target" : ""}`} id="folders">
            <h3>Plugged folders</h3>
            <div className="scope-list">
              {state.projectScopes.map((scope) => (
                <div key={scope.id} className={`scope-row ${isHighlighted(scope.id) ? "highlight-target" : ""}`}>
                  <strong>{scope.name}</strong>
                  <span>{scope.rootPath}</span>
                  <em>{scope.status}</em>
                </div>
              ))}
            </div>
          </section>

          {visibleGroups.map((group) => (
            <section key={group.id} id={group.id} className={`settings-group ${isHighlighted(group.id) ? "highlight-target" : ""}`}>
              <div className="settings-group-header">
                <h3>{group.label}</h3>
                <p>{group.description}</p>
              </div>
              <div className="setting-list">
                {group.items.map((item) => (
                  <SettingRow
                    key={item.id}
                    item={{ ...item, value: draft[item.id] ?? item.value }}
                    highlighted={isHighlighted(item.id)}
                    pending={!aiAvailable && isAISetting(group.id)}
                    onUpdate={(value) => {
                      setDraft((current) => ({ ...current, [item.id]: value }));
                      if (state.settingsGroups.some((group) => group.items.some((candidate) => candidate.id === item.id))) {
                        onUpdateSetting(item.id, value);
                      }
                    }}
                  />
                ))}
              </div>
            </section>
          ))}

          <section className="settings-group danger-zone">
            <div className="settings-group-header">
              <h3>Danger Zone</h3>
              <p>Destructive operations should always create audit records and require confirmation in the full app.</p>
            </div>
            <button onClick={onClearAIHistory}><ShieldAlert size={15} /> Clear AI chat history</button>
          </section>
        </div>
      </div>
    </section>
  );
}

function supplementalItems(groupId: string): SettingItem[] {
  const make = (suffix: string, label: string, description: string, value: SettingValue, control: SettingItem["control"] = "text"): SettingItem => ({
    id: `setting-${groupId}-${suffix}` as SettingId,
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
      make("port", "Local API port", "Port used by dashboard, recorder, SDK, and local integrations.", 4127, "number"),
    ],
    advanced: [
      make("schema", "Event schema version", "Version used by event streams, SDK, exports, and replay indexing.", "2026.05-alpha", "text"),
      make("debug", "Debug mode", "Increase recorder logs and show internal state panels.", false, "toggle"),
    ],
  };

  return byGroup[groupId] ?? [];
}

function SettingRow({
  item,
  highlighted,
  pending,
  onUpdate,
}: {
  item: SettingItem;
  highlighted: boolean;
  pending: boolean;
  onUpdate: (value: SettingValue) => void;
}) {
  return (
    <div id={item.id} className={`setting-row ${highlighted ? "highlight-target" : ""} ${item.dangerous ? "danger-setting" : ""} ${pending ? "pending-setting" : ""}`}>
      <div>
        <strong>{item.label}</strong>
        <p>{item.description}</p>
        <small>{item.path}</small>
        {pending ? <small className="setting-pending-label">Pending until MiniMax API key is configured</small> : null}
      </div>
      {renderControl(item, onUpdate)}
    </div>
  );
}

function isAISetting(groupId: string): boolean {
  return groupId === "ai-agent" || groupId === "ai-file-uploads";
}

function renderControl(item: SettingItem, onUpdate: (value: SettingValue) => void) {
  if (item.control === "toggle") {
    return (
      <label className="toggle">
        <input type="checkbox" checked={Boolean(item.value)} onChange={(event) => onUpdate(event.target.checked)} />
        <span />
      </label>
    );
  }

  if (item.control === "select" && item.options) {
    return (
      <select value={String(item.value)} onChange={(event) => onUpdate(event.target.value)}>
        {item.options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>{option.label}</option>
        ))}
      </select>
    );
  }

  if (item.control === "number" || item.control === "slider") {
    return (
      <input
        className="number-input"
        type="number"
        min={item.min}
        max={item.max}
        value={Number(item.value)}
        onChange={(event) => onUpdate(Number(event.target.value))}
      />
    );
  }

  return <input value={String(item.value ?? "")} onChange={(event) => onUpdate(event.target.value)} />;
}
