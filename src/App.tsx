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
import { clearAppMemory, getExportUrl, getStoredState, saveStoredState } from "./lib/apiClient";
import type { Task, TaskId } from "./data/types";

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

function createBlankTask(): Task {
  const timestamp = new Date(0).toISOString();
  return {
    id: "task-blank" as TaskId,
    name: "Blank",
    originalName: "Blank",
    status: "waiting-for-playwright",
    projectScopeId: "scope-blank",
    sessionIds: [],
    command: "",
    entryFile: "",
    cwd: "",
    createdAt: timestamp,
    updatedAt: timestamp,
    tags: ["blank"],
    summary: {
      browser: "unknown",
      eventCount: 0,
      issueCount: 0,
      failedRequestCount: 0,
      durationMs: 0
    }
  };
}

export function App() {
  const [state, setState] = useState(() => createEmptyAppState());
  const [activeView, setActiveView] = useState<ViewKey>("dashboard");
  const [query, setQuery] = useState("");
  const [highlightTargetId, setHighlightTargetId] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    let active = true;
    let refreshing = false;
    const refresh = () => void getStoredState().then((result) => {
      refreshing = false;
      if (!active || !result.ok || !result.data) return;
      setState(result.data);
    }).catch(() => {
      refreshing = false;
    });
    const guardedRefresh = () => {
      if (refreshing) return;
      refreshing = true;
      refresh();
    };
    guardedRefresh();
    const timer = window.setInterval(guardedRefresh, 750);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const searchResults = useMemo(() => searchApp(state, query), [query, state]);
  const blankTask = useMemo(() => createBlankTask(), []);
  const hasRealTasks = state.tasks.length > 0;
  const liveTasks = state.tasks.filter((task) => task.status === "recording");
  const historyTasks = state.tasks.filter((task) => task.status !== "recording");
  const selectedRealTask = state.tasks.find((task) => task.id === state.selectedTaskId);
  const visibleRealTasks = hasRealTasks
    ? [
        ...liveTasks,
        ...historyTasks.slice(0, 2),
        ...(selectedRealTask && !liveTasks.some((task) => task.id === selectedRealTask.id) && !historyTasks.slice(0, 2).some((task) => task.id === selectedRealTask.id)
          ? [selectedRealTask]
          : [])
      ]
    : [];
  const visibleTasks = hasRealTasks ? visibleRealTasks : [blankTask];
  const hiddenTaskCount = Math.max(0, state.tasks.length - visibleRealTasks.length);
  const selectedTask = state.tasks.find((task) => task.id === state.selectedTaskId) ?? state.tasks[0] ?? blankTask;
  const aiAvailable = useMemo(() => hasMiniMaxApiKey(), []);
  const aiUsable = aiAvailable && hasRealTasks;
  const session = state.sessions.find((s) => s.taskId === selectedTask?.id);
  const taskIssueCount = state.issues.filter((i) => i.taskId === selectedTask?.id).length;

  useEffect(() => {
    if (!hasRealTasks && activeView === "agent") setActiveView("dashboard");
  }, [activeView, hasRealTasks]);

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

  const clearMemory = async () => {
    const ok = window.confirm("Clear all PlayLens memory for the current storage folder? This removes tasks, sessions, artifacts, exports, settings snapshots, and AI chat history.");
    if (!ok) return;
    const result = await clearAppMemory();
    if (!result.ok) {
      window.alert(result.error ?? "Could not clear PlayLens memory.");
      return;
    }
    setState(createEmptyAppState());
    setActiveView("dashboard");
    setQuery("");
  };

  return (
    <div className="app-shell">
      <aside className="side-nav" aria-label="Primary navigation">
        <div className="brand-mark">
          <div className="brand-icon">D</div>
        </div>

        <nav className="nav-stack">
          {views.map((view) => {
            const Icon = view.icon;
            const disabled = view.key === "agent" && !hasRealTasks;
            return (
              <button
                key={view.key}
                className={`nav-item ${activeView === view.key ? "active" : ""}`}
                disabled={disabled}
                onClick={() => { setActiveView(view.key); setQuery(""); }}
                title={disabled ? "AI Agent is unavailable until a real recording exists." : view.label}
              >
                <Icon size={17} />
                <span>{view.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="system-card" title={aiUsable ? state.aiAgent.status : "AI disabled"}>
          <ShieldCheck size={16} />
          <div>
            <strong>{aiUsable ? state.aiAgent.mode : "AI disabled"}</strong>
            <span>{!hasRealTasks ? "blank task" : aiAvailable ? state.aiAgent.status : "missing key"}</span>
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

          <a className="top-action-button" href={getExportUrl("json")}>
            <Download size={13} /> Export
          </a>
          <div className="top-menu-wrap">
            <button className="top-icon-button" type="button" aria-label="More actions" aria-expanded={moreOpen} onClick={() => setMoreOpen((current) => !current)}>
              <MoreVertical size={15} />
            </button>
            {moreOpen ? (
              <div className="top-menu">
                <button onClick={() => { setActiveView("data"); setMoreOpen(false); }}>Open Data</button>
                <button onClick={() => { setActiveView("settings"); setMoreOpen(false); }}>Open Settings</button>
                <a href={getExportUrl("ndjson")}>Export NDJSON</a>
                <a href={getExportUrl("markdown")}>Export Markdown</a>
              </div>
            ) : null}
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
              tasks={visibleTasks}
              totalTaskCount={hasRealTasks ? state.tasks.length : 1}
              hiddenTaskCount={hiddenTaskCount}
              selectedTaskId={selectedTask.id}
              highlightTargetId={highlightTargetId}
              onSelectTask={(taskId) => {
                if (taskId === "task-blank") return;
                setState((current) => {
                  const next = { ...current, selectedTaskId: taskId };
                  void saveStoredState(next);
                  return next;
                });
              }}
              onRenameTask={(taskId, name) => taskId !== "task-blank" && runAction(appActions.renameTask, taskId, name)}
            />
          )}

          <section className="content-plane">
            {activeView === "dashboard" && (
              <InvestigationDashboard
                state={state}
                selectedTask={selectedTask}
                highlightTargetId={highlightTargetId}
                onOpenSettings={() => setActiveView("settings")}
                aiAvailable={aiUsable}
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
                onClearMemory={clearMemory}
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
