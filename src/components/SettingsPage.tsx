import { FolderPlus, Search, ShieldAlert, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { SettingId, SettingItem, SettingValue } from "../data/types";
import type { PlayLensState } from "../state/appState";
import { ensureCompleteSettingsGroups } from "../settings/settingsCatalog";

interface SettingsPageProps {
  state: PlayLensState;
  highlightTargetId: string | null;
  aiAvailable: boolean;
  onUpdateSetting: (settingId: SettingId, value: SettingValue) => void;
  onAddWatchedFolder: (folderPath: string) => void;
  onClearAIHistory: () => void;
  onClearMemory: () => void;
}

export function SettingsPage({ state, highlightTargetId, aiAvailable, onUpdateSetting, onAddWatchedFolder, onClearAIHistory, onClearMemory }: SettingsPageProps) {
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Record<string, SettingValue>>({});

  const groups = useMemo(() => ensureCompleteSettingsGroups(state.settingsGroups), [state.settingsGroups]);

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
                <p>AI API key is missing. AI settings can be edited and saved, but they only take effect after a provider API key (e.g. <code>OPENAI_API_KEY</code>) is set on the backend server and PlayLens is restarted.</p>
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
                      onUpdateSetting(item.id, value);
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
            <button onClick={onClearMemory}><Trash2 size={15} /> Clear Memory</button>
          </section>
        </div>
      </div>
    </section>
  );
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
        {pending ? <small className="setting-pending-label">Pending until AI API key is configured</small> : null}
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
