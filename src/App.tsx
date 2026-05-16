import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Chrome,
  Clock,
  Database,
  Download,
  Gauge,
  Globe,
  LayoutDashboard,
  MoreVertical,
  Search,
  Settings,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { AIAgentPanel } from "./components/AIAgentPanel";
import { GlobalSearch } from "./components/GlobalSearch";
import { InvestigationDashboard } from "./components/InvestigationDashboard";
import { SettingsPage } from "./components/SettingsPage";
import { TaskRail } from "./components/TaskRail";
import { DataAccessPage } from "./components/DataAccessPage";
import { createEmptyAppState, searchApp, appActions } from "./state/appState";
import { hasMiniMaxApiKey } from "./agent/minimaxAdapter";
import { getStoredState, saveStoredState, getExportUrl } from "./lib/apiClient";

type ViewKey = "dashboard" | "settings" | "agent" | "data";

const views: Array<{ key: ViewKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { key: "settings", label: "Settings", icon: Settings },
  { key: "agent", label: "AI Agent", icon: Bot },
  { key: "data", label: "Data", icon: Database },
];

function formatDuration(ms?: number): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function App() {
  const [state, setState] = useState(() => createEmptyAppState());
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [query, setQuery] = useState("");
  const [highlightTargetId, setHighlightTargetId] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () => void getStoredState().then((result) => {
      if (!active || !result.ok || !result.data) return;
      setState(result.data);
    });
    refresh();
    const timer = window.setInterval(refresh, 2500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        const searchInput = document.querySelector<HTMLInputElement>('.search-shell input');
        searchInput?.focus();
      }
      if (e.key === "Escape") {
        setShowExportMenu(false);
        setShowMoreMenu(false);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.top-action-wrap')) {
        setShowExportMenu(false);
        setShowMoreMenu(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("click", handleClickOutside, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("click", handleClickOutside, true);
    };
  }, []);

  const searchResults = useMemo(() => searchApp(state, query), [query, state]);
  const selectedTask = state.tasks.find((task) => task.id === state.selectedTaskId) ?? state.tasks[0];
  const aiAvailable = useMemo(() => hasMiniMaxApiKey(), []);
  const session = state.sessions.find((s) => s.taskId === selectedTask?.id);
  const taskIssueCount = state.issues.filter((i) => i.taskId === selectedTask?.id).length;

  const runAction = <T extends unknown[]>(action: (current: typeof state, ...args: T) => typeof state, ...args: T) => {
    setState((current) => {
      const next = action(current, ...args);
      void saveStoredState(next);
      return next;
    });
  };

  const jumpToTarget = (targetId: string, view?: ViewKey) => {
    if (view) setActiveView(view);
    setHighlightTargetId(targetId);
    window.setTimeout(() => {
      setHighlightTargetId((current) => (current === targetId ? null : current));
    }, 10000);
  };

  return (
    <div className="app-shell">
      <aside className="side-nav" aria-label="Primary navigation">
        <div className="brand-mark">
          <div className="brand-icon">P</div>
        </div>

        <nav className="nav-stack">
          {views.map((view) => {
            const Icon = view.icon;
            return (
              <button
                key={view.key}
                className={`nav-item ${activeView === view.key ? "active" : ""}`}
                onClick={() => { setActiveView(view.key); setQuery(""); }}
                title={view.label}
              >
                <Icon size={17} />
                <span>{view.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="system-card" title={aiAvailable ? state.aiAgent.status : "AI disabled"}>
          <ShieldCheck size={16} />
          <div>
            <strong>{aiAvailable ? state.aiAgent.mode : "AI disabled"}</strong>
            <span>{aiAvailable ? state.aiAgent.status : "missing key"}</span>
          </div>
        </div>
      </aside>

      <main className="main-shell">
        <header className="top-bar">
          <div className="task-title-block">
            <h1>{selectedTask?.name ?? "No task selected"}</h1>
            {selectedTask && (
              <span className={`info-badge status-${selectedTask.status}`}>
                {selectedTask.status === "failed" ? "Failed" : selectedTask.status === "recording" ? "Recording" : selectedTask.status}
              </span>
            )}
          </div>

          <div className="info-badges">
            {session?.browser && session.browser.name !== "unknown" && (
              <span className="top-stat"><small>Browser</small><strong><Chrome size={12} /> {session.browser.name} {session.browser.version?.split(".")[0]}</strong></span>
            )}
            {selectedTask?.summary.durationMs && (
              <span className="top-stat"><small>Duration</small><strong><Clock size={12} /> {formatDuration(selectedTask.summary.durationMs)}</strong></span>
            )}
            {selectedTask?.summary.currentUrl && (
              <span className="top-stat wide"><small>URL</small><strong><Globe size={12} /> {new URL(selectedTask.summary.currentUrl).pathname}</strong></span>
            )}
            {taskIssueCount > 0 && (
              <span className="top-stat danger"><small>Issues</small><strong><AlertTriangle size={12} /> {taskIssueCount}</strong></span>
            )}
          </div>

          <div className="search-shell">
            <Search size={14} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search (⌘K)"
              aria-label="Search PlayLens"
            />
          </div>

          {state.systemMetrics.length > 0 ? (
            <div className="metric-strip">
              <span className="metric-danger"><small>CPU</small><strong><Gauge size={12} /> {state.system.cpuPercent}%</strong></span>
              <span><small>Memory</small><strong>{(state.system.memoryMb / 1024).toFixed(1)} GB</strong></span>
            </div>
          ) : null}

          <div className="top-action-wrap">
            <button className="top-action-button" type="button" onClick={() => { setShowExportMenu((v) => !v); setShowMoreMenu(false); }}>
              <Download size={13} /> Export
            </button>
            {showExportMenu && (
              <div className="dropdown-menu export-dropdown">
                <a href={getExportUrl("json")} target="_blank" rel="noopener noreferrer" onClick={() => setShowExportMenu(false)}>Export as JSON</a>
                <a href={getExportUrl("ndjson")} target="_blank" rel="noopener noreferrer" onClick={() => setShowExportMenu(false)}>Export as NDJSON</a>
                <a href={getExportUrl("markdown")} target="_blank" rel="noopener noreferrer" onClick={() => setShowExportMenu(false)}>Export as Markdown</a>
              </div>
            )}
          </div>
          <div className="top-action-wrap">
            <button className="top-icon-button" type="button" aria-label="More actions" onClick={() => { setShowMoreMenu((v) => !v); setShowExportMenu(false); }}>
              <MoreVertical size={15} />
            </button>
            {showMoreMenu && (
              <div className="dropdown-menu more-dropdown">
                <button onClick={() => { setActiveView("settings"); setShowMoreMenu(false); }}>Open Settings</button>
                <button onClick={() => { runAction(appActions.clearAIChatHistory); setShowMoreMenu(false); }}>Clear AI History</button>
                <button onClick={() => { setActiveView("data"); setShowMoreMenu(false); }}>Data & Export</button>
              </div>
            )}
          </div>
        </header>

        {query.trim().length > 0 && (
          <GlobalSearch
            query={query}
            results={searchResults}
            onOpenResult={(result) => jumpToTarget(result.targetId, result.view as ViewKey)}
          />
        )}

        <div className={`workspace-grid ${activeView === "dashboard" ? "dashboard-mode" : ""}`}>
          {activeView !== "dashboard" && (
            <TaskRail
              tasks={state.tasks}
              selectedTaskId={state.selectedTaskId}
              highlightTargetId={highlightTargetId}
              onSelectTask={(taskId) => setState((current) => {
                const next = { ...current, selectedTaskId: taskId };
                void saveStoredState(next);
                return next;
              })}
              onRenameTask={(taskId, name) => runAction(appActions.renameTask, taskId, name)}
            />
          )}

          <section className="content-plane">
            {activeView === "dashboard" && (
              <InvestigationDashboard
                state={state}
                selectedTask={selectedTask}
                highlightTargetId={highlightTargetId}
                onOpenSettings={() => setActiveView("settings")}
                aiAvailable={aiAvailable}
              />
            )}
            {activeView === "settings" && (
              <SettingsPage
                state={state}
                highlightTargetId={highlightTargetId}
                aiAvailable={aiAvailable}
                onUpdateSetting={(settingId, value) => runAction(appActions.updateSetting, settingId, value)}
                onAddWatchedFolder={(folderPath) => runAction(appActions.addWatchedFolder, folderPath)}
                onClearAIHistory={() => runAction(appActions.clearAIChatHistory)}
              />
            )}
            {activeView === "agent" && (
              <div className="console-page agent-console-page">
                <AIAgentPanel
                  mode={state.aiAgent.mode}
                  status={state.aiAgent.status === "waiting-for-approval" ? "paused" : state.aiAgent.status}
                  onPause={() => runAction(appActions.pauseAgent)}
                  onResume={() => runAction(appActions.resumeAgent)}
                  onStop={() => runAction(appActions.stopAgent)}
                  onClearHistory={() => runAction(appActions.clearAIChatHistory)}
                />
              </div>
            )}
            {activeView === "data" && (
              <DataAccessPage state={state} />
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
