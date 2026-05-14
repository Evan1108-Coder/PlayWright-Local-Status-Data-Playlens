import { useMemo, useState } from "react";
import {
  Bot,
  Chrome,
  Clock,
  Database,
  Gauge,
  Globe,
  LayoutDashboard,
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
import { createInitialAppState, searchApp, appActions } from "./state/appState";
import { hasMiniMaxApiKey } from "./agent/minimaxAdapter";

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
  const [state, setState] = useState(() => createInitialAppState());
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [query, setQuery] = useState("");
  const [highlightTargetId, setHighlightTargetId] = useState<string | null>(null);

  const searchResults = useMemo(() => searchApp(state, query), [query, state]);
  const selectedTask = state.tasks.find((task) => task.id === state.selectedTaskId) ?? state.tasks[0];
  const aiAvailable = useMemo(() => hasMiniMaxApiKey(), []);
  const session = state.sessions.find((s) => s.taskId === selectedTask?.id);
  const taskIssueCount = state.issues.filter((i) => i.taskId === selectedTask?.id).length;

  const runAction = <T extends unknown[]>(action: (current: typeof state, ...args: T) => typeof state, ...args: T) => {
    setState((current) => action(current, ...args));
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
          <div className="brand-icon">PL</div>
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
            {session?.browser && (
              <span className="info-badge"><Chrome size={11} /> {session.browser.name} {session.browser.version?.split(".")[0]}</span>
            )}
            {selectedTask?.summary.durationMs && (
              <span className="info-badge"><Clock size={11} /> {formatDuration(selectedTask.summary.durationMs)}</span>
            )}
            {selectedTask?.summary.currentUrl && (
              <span className="info-badge"><Globe size={11} /> {new URL(selectedTask.summary.currentUrl).pathname}</span>
            )}
            {taskIssueCount > 0 && (
              <span className="info-badge"><AlertTriangle size={11} /> {taskIssueCount}</span>
            )}
          </div>

          <div className="search-shell">
            <Search size={14} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search..."
              aria-label="Search PlayLens"
            />
          </div>

          <div className="metric-strip">
            <span><Gauge size={12} /> CPU {state.system.cpuPercent}%</span>
            <span>Mem {state.system.memoryMb} MB</span>
          </div>
        </header>

        {query.trim().length > 0 && (
          <GlobalSearch
            query={query}
            results={searchResults}
            onOpenResult={(result) => jumpToTarget(result.targetId, result.view as ViewKey)}
          />
        )}

        <div className="workspace-grid">
          <TaskRail
            tasks={state.tasks}
            selectedTaskId={state.selectedTaskId}
            highlightTargetId={highlightTargetId}
            onSelectTask={(taskId) => setState((current) => ({ ...current, selectedTaskId: taskId }))}
            onRenameTask={(taskId, name) => runAction(appActions.renameTask, taskId, name)}
          />

          <section className="content-plane">
            {activeView === "dashboard" && (
              <InvestigationDashboard
                state={state}
                selectedTask={selectedTask}
                highlightTargetId={highlightTargetId}
                onOpenSettings={() => setActiveView("settings")}
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
              <AIAgentPanel
                mode={state.aiAgent.mode}
                status={state.aiAgent.status === "waiting-for-approval" ? "paused" : state.aiAgent.status}
                onPause={() => runAction(appActions.pauseAgent)}
                onResume={() => runAction(appActions.resumeAgent)}
                onStop={() => runAction(appActions.stopAgent)}
                onClearHistory={() => runAction(appActions.clearAIChatHistory)}
              />
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
