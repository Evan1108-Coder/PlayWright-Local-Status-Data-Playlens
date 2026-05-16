import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Cpu,
  Database,
  FileText,
  GitBranch,
  Maximize2,
  MessageSquare,
  Monitor,
  Network,
  Play,
  RotateCcw,
  Send,
  TerminalSquare,
  X,
  Zap,
} from "lucide-react";
import type { EventKind, Task, TimelineEvent } from "../data/types";
import type { PlayLensState } from "../state/appState";
import { getArtifactUrl, getExportUrl } from "../lib/apiClient";

interface InvestigationDashboardProps {
  state: PlayLensState;
  selectedTask?: Task;
  highlightTargetId: string | null;
  onOpenSettings: () => void;
  aiAvailable: boolean;
}

type BadgeTone = "info" | "step" | "nav" | "action" | "req" | "resp" | "console" | "perf" | "issue";
type GraphNode = { id?: TimelineEvent["id"]; tone: string; title: string; body: string; meta: string };
type VisualArtifact = { id?: string; path: string; label?: string; mimeType?: string; kind?: string };

function eventBadge(kind: EventKind): { label: string; cls: BadgeTone } {
  const map: Record<string, { label: string; cls: BadgeTone }> = {
    "task.created": { label: "INFO", cls: "info" },
    "playwright.detected": { label: "STEP", cls: "step" },
    "browser.launched": { label: "INFO", cls: "info" },
    "page.navigated": { label: "NAV", cls: "nav" },
    "action.started": { label: "ACTION", cls: "action" },
    "action.completed": { label: "ACTION", cls: "action" },
    "assertion.failed": { label: "ISSUE", cls: "issue" },
    "network.request": { label: "REQ", cls: "req" },
    "network.response": { label: "RESP", cls: "resp" },
    "console.message": { label: "CONSOLE", cls: "console" },
    "dom.snapshot": { label: "DOM", cls: "info" },
    "accessibility.snapshot": { label: "A11Y", cls: "info" },
    "terminal.output": { label: "LOG", cls: "step" },
    "system.metric": { label: "PERF", cls: "perf" },
    "issue.detected": { label: "ISSUE", cls: "issue" },
    "ai.action": { label: "ACTION", cls: "action" },
  };
  return map[kind] ?? { label: "INFO", cls: "info" };
}

function formatClock(iso?: string): string {
  if (!iso) return "00:00.000";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 });
}

function formatOffset(iso: string, start?: string): string {
  const base = start ? new Date(start).getTime() : new Date(iso).getTime();
  const delta = Math.max(0, new Date(iso).getTime() - base);
  const minutes = Math.floor(delta / 60000).toString().padStart(2, "0");
  const seconds = Math.floor((delta % 60000) / 1000).toString().padStart(2, "0");
  const ms = Math.floor(delta % 1000).toString().padStart(3, "0");
  return `${minutes}:${seconds}.${ms}`;
}

function formatDuration(ms?: number): string {
  if (ms == null) return "--";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function shortPath(url?: string): string {
  if (!url) return "--";
  try {
    return new URL(url).pathname;
  } catch {
    return url.replace(/^https?:\/\/[^/]+/, "") || url;
  }
}

export function InvestigationDashboard({ state, selectedTask, highlightTargetId, aiAvailable }: InvestigationDashboardProps) {
  const taskEvents = state.events.filter((e) => e.taskId === selectedTask?.id);
  const panelEvents = taskEvents.length > 90 ? taskEvents.slice(-90) : taskEvents;
  const taskIssues = state.issues.filter((i) => i.taskId === selectedTask?.id);
  const metrics = state.systemMetrics.filter((m) => m.taskId === selectedTask?.id);
  const session = state.sessions.find((s) => s.taskId === selectedTask?.id);
  const selectedIssue = taskIssues[0];
  const networkEvents = panelEvents.filter((e) => e.request);
  const actionEvent = [...panelEvents].reverse().find((e) => e.kind === "action.completed" || e.kind === "action.started") ?? panelEvents.find((e) => e.source) ?? panelEvents[0];
  const [selectedEventId, setSelectedEventId] = useState<string | undefined>(actionEvent?.id);
  const latestEventId = panelEvents.at(-1)?.id;
  const selectedEvent = panelEvents.find((event) => event.id === selectedEventId) ?? actionEvent;
  const startTime = taskEvents[0]?.timestamp ?? session?.startedAt;
  const activeTime = selectedEvent ? formatOffset(selectedEvent.timestamp, startTime) : "00:00.000";

  useEffect(() => {
    setSelectedEventId(session?.status === "running" ? latestEventId ?? actionEvent?.id : actionEvent?.id);
  }, [selectedTask?.id, session?.status, latestEventId, actionEvent?.id]);

  if (!selectedTask || !session || taskEvents.length === 0) {
    return (
      <section className="observability-console empty-dashboard" aria-label="PlayLens browser investigation dashboard">
        <div className="empty-dashboard-message">
          <h2>No active recording</h2>
          <p>Start a Playwright command through PlayLens or point the backend at a folder with recorded `.playlens/sessions`. Until then, PlayLens shows the Blank task with zero data, no demo values, and AI disabled.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="observability-console" aria-label="PlayLens browser investigation dashboard">
      <TimelinePanel events={panelEvents} startTime={startTime} highlightTargetId={highlightTargetId} selectedEventId={selectedEvent?.id} onSelectEvent={setSelectedEventId} hiddenCount={taskEvents.length - panelEvents.length} />
      <ReplayPanel selectedTask={selectedTask} session={session} selectedIssue={selectedIssue} activeTime={activeTime} events={panelEvents} selectedEvent={selectedEvent} onSelectEvent={setSelectedEventId} />
      <CausalPanel events={panelEvents} issue={selectedIssue} actionEvent={selectedEvent} startTime={startTime} onSelectEvent={setSelectedEventId} />
      <MetricsPanel metrics={metrics} networkEvents={networkEvents} events={panelEvents} />
      <AICompactPanel state={state} issue={selectedIssue} aiAvailable={aiAvailable} />
      <TerminalPanel events={panelEvents} selectedEventId={selectedEvent?.id} onSelectEvent={setSelectedEventId} />
      <GraphPanel events={panelEvents} issue={selectedIssue} actionEvent={selectedEvent} startTime={startTime} onSelectEvent={setSelectedEventId} />
    </section>
  );
}

function TimelinePanel({ events, startTime, highlightTargetId, selectedEventId, onSelectEvent, hiddenCount }: { events: TimelineEvent[]; startTime?: string; highlightTargetId: string | null; selectedEventId?: string; onSelectEvent: (eventId: string) => void; hiddenCount: number }) {
  return (
    <aside className="console-panel timeline-console">
      <PanelTitle title="Timeline" actions={<><Zap size={13} /><Code2 size={13} /></>} />
      <div className="timeline-track">
        {hiddenCount > 0 ? <div className="timeline-window-note">{hiddenCount} older events hidden from the UI window. Exports/API still include everything.</div> : null}
        {events.map((event) => {
          const badge = eventBadge(event.kind);
          return (
            <button type="button" key={event.id} className={`console-event ${badge.cls} ${selectedEventId === event.id ? "selected" : ""} ${highlightTargetId === event.id ? "highlight-target" : ""}`} onClick={() => onSelectEvent(event.id)}>
              <span className="event-dot" />
              <time>{formatOffset(event.timestamp, startTime)}</time>
              <div className="event-copy">
                <strong>{event.title}</strong>
                <p>{event.message}</p>
              </div>
              <span className={`event-badge ${badge.cls}`}>{badge.label}</span>
              <em>{formatDuration(event.durationMs)}</em>
            </button>
          );
        })}
        {events.length === 0 ? <div className="empty-console">No events recorded for this task.</div> : null}
      </div>
    </aside>
  );
}

function ReplayPanel({ selectedTask, session, selectedIssue, activeTime, events, selectedEvent, onSelectEvent }: {
  selectedTask?: Task;
  session?: PlayLensState["sessions"][number];
  selectedIssue?: PlayLensState["issues"][number];
  activeTime: string;
  events: TimelineEvent[];
  selectedEvent?: TimelineEvent;
  onSelectEvent: (eventId: string) => void;
}) {
  const [activeTab, setActiveTab] = useState("Replay");
  const [isPlaying, setIsPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const domEvent = [...events].reverse().find((event) => event.kind === "dom.snapshot");
  const consoleEvents = events.filter((event) => event.kind === "console.message");
  const networkEvents = events.filter((event) => event.request);
  const terminalEvents = events.filter((event) => event.kind === "terminal.output");
  const currentUrl = selectedTask?.summary.currentUrl ?? session?.currentUrl ?? events.find((event) => event.url)?.url ?? events.find((event) => event.request?.url)?.request?.url;
  const viewport = session?.browser.viewport;
  const beforeText = typeof domEvent?.data.beforeText === "string" ? domEvent.data.beforeText : "";
  const afterText = typeof domEvent?.data.afterText === "string" ? domEvent.data.afterText : "";
  const visualArtifact = findVisualArtifact(selectedEvent) ?? [...events].reverse().map((event) => findVisualArtifact(event)).find(Boolean);
  const selectedIndex = Math.max(0, events.findIndex((event) => event.id === selectedEvent?.id));
  const canMoveBack = selectedIndex > 0;
  const canMoveForward = selectedIndex >= 0 && selectedIndex < events.length - 1;
  const move = (direction: -1 | 1) => {
    const next = events[selectedIndex + direction];
    if (next) onSelectEvent(next.id);
  };

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      const currentIndex = Math.max(0, events.findIndex((event) => event.id === selectedEvent?.id));
      const next = events[currentIndex + 1];
      if (next) onSelectEvent(next.id);
      else setIsPlaying(false);
    }, 800);
    return () => window.clearInterval(timer);
  }, [events, isPlaying, onSelectEvent, selectedEvent?.id]);

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

  return (
    <section className={`console-panel replay-console ${expanded ? "expanded" : ""}`}>
      <div className="console-tabs">
        {["Replay", "DOM", "Console", "Network", "Logs"].map((tab) => (
          <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab}</button>
        ))}
        {expanded ? <button className="expanded-exit-button" onClick={() => setExpanded(false)}><X size={13} /> Exit full screen</button> : null}
      </div>
      <div className="replay-toolbar">
        <button title="Previous event" disabled={!canMoveBack} onClick={() => move(-1)}><ChevronLeft size={13} /></button>
        <button title="Next event" disabled={!canMoveForward} onClick={() => move(1)}><ChevronRight size={13} /></button>
        <button title="Reset to first event" onClick={() => events[0] && onSelectEvent(events[0].id)}><RotateCcw size={12} /></button>
        <div className="url-field">{currentUrl ?? "No URL captured"}</div>
        <span className="viewport-pill"><Monitor size={13} /> {viewport?.width ? `${viewport.width} x ${viewport.height}` : "viewport unknown"}</span>
      </div>
      <div className="browser-canvas">
        {activeTab === "Replay" ? (
          visualArtifact ? (
            <div className="visual-replay-frame">
              <img src={getArtifactUrl(session!.id, visualArtifact.path)} alt={visualArtifact.label ?? "Captured Playwright browser screen"} />
              <span>{visualArtifact.label ?? visualArtifact.path}</span>
            </div>
          ) : (
            <div className="real-replay-empty">
              <Monitor size={28} />
              <h3>No browser screenshot artifact captured</h3>
              <p>This recording has real event, network, console, terminal, and DOM data, but no screenshot artifact. Run a recording with visual capture enabled to show the browser screen here.</p>
              {selectedIssue ? <strong>{selectedIssue.title}</strong> : null}
            </div>
          )
        ) : null}
        {activeTab === "DOM" ? <EvidenceText title="DOM snapshot after selected event" value={afterText || beforeText} empty="No DOM snapshot captured in this recording." /> : null}
        {activeTab === "Console" ? <EvidenceList events={consoleEvents} empty="No browser console messages captured." /> : null}
        {activeTab === "Network" ? <NetworkEvidence events={networkEvents} /> : null}
        {activeTab === "Logs" ? <EvidenceList events={terminalEvents.length ? terminalEvents : events} empty="No terminal output captured." /> : null}
      </div>
      <div className="replay-footer">
        <div className="transport">
          <button disabled={events.length < 2} onClick={() => setIsPlaying((current) => !current)} title={isPlaying ? "Pause event playback" : "Play event sequence"}><Play size={12} /></button>
        </div>
        <strong>{activeTime}</strong><span>/ {formatDuration(selectedTask?.summary.durationMs ?? session?.durationMs)}</span>
        <div className="scrubber"><span style={{ width: `${events.length > 1 ? ((selectedIndex + 1) / events.length) * 100 : 100}%` }} /></div>
        <span>1x</span>
        <button className="fullscreen-button" onClick={() => setExpanded((current) => !current)} title={expanded ? "Collapse replay" : "Expand replay"}><Maximize2 size={13} /></button>
      </div>
    </section>
  );
}

function EvidenceText({ title, value, empty }: { title: string; value: string; empty: string }) {
  return (
    <div className="evidence-pane">
      <h3>{title}</h3>
      {value ? <pre>{value}</pre> : <p>{empty}</p>}
    </div>
  );
}

function EvidenceList({ events, empty }: { events: TimelineEvent[]; empty: string }) {
  return (
    <div className="evidence-pane">
      {events.length ? events.map((event) => (
        <article key={event.id} className="evidence-row">
          <time>{formatClock(event.timestamp)}</time>
          <strong>{event.title}</strong>
          <p>{event.message}</p>
        </article>
      )) : <p>{empty}</p>}
    </div>
  );
}

function NetworkEvidence({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="evidence-pane">
      {events.length ? (
        <table className="evidence-table">
          <thead><tr><th>Method</th><th>URL</th><th>Status</th><th>Duration</th></tr></thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>{event.request?.method ?? "--"}</td>
                <td>{event.request?.url ?? event.url ?? "--"}</td>
                <td>{event.request?.status ?? "--"}</td>
                <td>{formatDuration(event.request?.durationMs ?? event.durationMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p>No network requests captured.</p>}
    </div>
  );
}

function findVisualArtifact(event?: TimelineEvent, preferredKind?: string): VisualArtifact | undefined {
  const artifacts = event?.data.artifacts;
  if (!Array.isArray(artifacts)) return undefined;
  const visualArtifacts = artifacts
    .map((artifact): VisualArtifact | undefined => {
      if (!artifact || typeof artifact !== "object") return undefined;
      const item = artifact as Record<string, unknown>;
      const path = typeof item.path === "string" ? item.path : typeof item.relativePath === "string" ? item.relativePath : undefined;
      if (!path) return undefined;
      const mimeType = typeof item.mimeType === "string" ? item.mimeType : undefined;
      if (mimeType && !mimeType.startsWith("image/")) return undefined;
      return {
        id: typeof item.id === "string" ? item.id : undefined,
        path,
        label: typeof item.label === "string" ? item.label : undefined,
        mimeType,
        kind: typeof item.kind === "string" ? item.kind : undefined
      };
    })
    .filter((artifact): artifact is VisualArtifact => Boolean(artifact));
  return preferredKind ? visualArtifacts.find((artifact) => artifact.kind === preferredKind) ?? visualArtifacts[0] : visualArtifacts[0];
}

function CausalPanel({ events, issue, actionEvent, startTime, onSelectEvent }: { events: TimelineEvent[]; issue?: PlayLensState["issues"][number]; actionEvent?: TimelineEvent; startTime?: string; onSelectEvent: (eventId: string) => void }) {
  const artifacts = events.filter((event) => event.request || event.relatedIssueIds.length || event.kind === "console.message" || event.kind === "dom.snapshot").slice(0, 6);

  return (
    <aside className="console-panel causal-console">
      <PanelTitle title="Causal Chain" actions={<><GitBranch size={13} /><Code2 size={13} /></>} />
      <div className="selected-action-card">
        <span>Selected Action</span>
        <strong>{actionEvent?.title ?? "No action selected"}<time>{actionEvent ? formatOffset(actionEvent.timestamp, startTime) : "--"}</time></strong>
        <dl>
          <dt>Source</dt><dd>{issue?.source ? `${issue.source.filePath}:${issue.source.line ?? "--"}` : actionEvent?.source ? `${actionEvent.source.filePath}:${actionEvent.source.line ?? "--"}` : "--"}</dd>
          <dt>Locator</dt><dd>{actionEvent?.locator ?? "--"}</dd>
          <dt>URL</dt><dd>{actionEvent?.url ?? actionEvent?.request?.url ?? "--"}</dd>
        </dl>
      </div>
      <StatePreview title="Before State" event={events.find((event) => event.kind === "dom.snapshot")} field="beforeText" artifactKind="before" />
      <StatePreview title="After State" event={events.find((event) => event.kind === "dom.snapshot")} field="afterText" artifactKind="after" failed={Boolean(issue)} />
      <div className="related-list">
        <h3>Related Artifacts</h3>
        {artifacts.map((event) => {
          const badge = eventBadge(event.kind);
          return (
            <button key={event.id} onClick={() => onSelectEvent(event.id)} title="Select this artifact in the timeline">
              <span className={`event-badge ${badge.cls}`}>{badge.label}</span>
              <strong>{event.request?.url.split('/').pop() ?? event.title}</strong>
              <em>{event.request?.status ?? formatDuration(event.durationMs)}</em>
              <ArrowRight size={12} />
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function StatePreview({ title, event, field, artifactKind, failed }: { title: string; event?: TimelineEvent; field: "beforeText" | "afterText"; artifactKind: "before" | "after"; failed?: boolean }) {
  const value = typeof event?.data[field] === "string" ? event.data[field] as string : "";
  const artifact = event ? findVisualArtifact(event, artifactKind) : undefined;
  return (
    <div className="state-preview">
      <h3>{title}</h3>
      <div className={`state-thumb real-state-thumb ${failed ? "failed" : ""}`}>
        {artifact ? <img src={getArtifactUrl(event!.sessionId, artifact.path)} alt={artifact.label ?? title} /> : value ? <pre>{value}</pre> : <span>No DOM {field === "beforeText" ? "before" : "after"} snapshot captured.</span>}
      </div>
    </div>
  );
}

function MetricsPanel({ metrics, networkEvents, events }: { metrics: PlayLensState["systemMetrics"]; networkEvents: TimelineEvent[]; events: TimelineEvent[] }) {
  return (
    <section className="metrics-console">
      <CpuMemoryChart metrics={metrics} />
      <NetworkWaterfall events={networkEvents} />
      <RequestStatusDonut counts={computeRequestStatusCounts(networkEvents)} total={networkEvents.length} />
      <EventDensityChart events={events} />
    </section>
  );
}

function AICompactPanel({ state, issue, aiAvailable }: { state: PlayLensState; issue?: PlayLensState["issues"][number]; aiAvailable: boolean }) {
  const [prompt, setPrompt] = useState("");
  const [tab, setTab] = useState<"AI Chat" | "Exports" | "Plugins">("AI Chat");
  const aiEnabled = aiAvailable && state.aiAgent.enabled;
  const prompts = [
    issue ? "Why did the payment request fail?" : "What changed in this run?",
    "Show all errors and related requests",
    "What changed in the DOM after the error?",
  ];

  return (
    <section className="console-panel ai-console">
      <div className="drawer-tabs compact-tabs">
        {(["AI Chat", "Exports", "Plugins"] as const).map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}{item === "AI Chat" ? <span>BETA</span> : null}</button>
        ))}
      </div>
      {tab === "AI Chat" ? (
        <>
          <div className="ai-prompt-stack">
            <p>{aiEnabled ? "Ask about this session..." : "AI is unavailable until a MiniMax API key is configured."}</p>
            {prompts.map((item) => <button key={item} disabled={!aiEnabled} onClick={() => setPrompt(item)}>{item}</button>)}
          </div>
          <div className={`ai-chat-input compact-input ${!aiEnabled ? "ai-disabled-input" : ""}`}>
            <input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={aiEnabled ? "Ask about this session..." : "MiniMax API key missing"} />
            <button disabled={!aiEnabled} title={aiEnabled ? "Ask AI" : "MiniMax API key missing"}><Send size={14} /></button>
          </div>
        </>
      ) : null}
      {tab === "Exports" ? (
        <div className="compact-panel-body">
          <a href={getExportUrl("json")}>JSON export</a>
          <a href={getExportUrl("ndjson")}>NDJSON export</a>
          <a href={getExportUrl("markdown")}>Markdown export</a>
        </div>
      ) : null}
      {tab === "Plugins" ? (
        <div className="compact-panel-body">
          <span>CLI supervisor: active</span>
          <span>Runtime hook: active</span>
          <span>MiniMax: {aiAvailable ? "configured" : "missing key"}</span>
        </div>
      ) : null}
    </section>
  );
}

function TerminalPanel({ events, selectedEventId, onSelectEvent }: { events: TimelineEvent[]; selectedEventId?: string; onSelectEvent: (eventId: string) => void }) {
  const [tab, setTab] = useState<"Terminal" | "Raw Events" | "Source">("Terminal");
  const selectedEvent = events.find((event) => event.id === selectedEventId);
  return (
    <section className="console-panel terminal-console">
      <div className="drawer-tabs compact-tabs">
        {(["Terminal", "Raw Events", "Source"] as const).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}
      </div>
      <div className="terminal-toolbar"><span>{tab === "Terminal" ? "bash" : tab}</span><TerminalSquare size={13} /><Code2 size={13} /></div>
      {tab === "Terminal" ? (
        <div className="terminal-lines console-terminal-lines">
          {events.map((event) => {
            const level = event.severity === "critical" || event.severity === "error" ? "error" : event.severity;
            return (
              <button key={event.id} className={`terminal-line ${selectedEventId === event.id ? "selected" : ""}`} onClick={() => onSelectEvent(event.id)}>
                <span className="term-time">{formatClock(event.timestamp)}</span>
                <span className={`term-level ${level}`}>{level.toUpperCase()}</span>
                <span className="term-message">{event.message}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {tab === "Raw Events" ? (
        <div className="raw-event-view"><pre>{JSON.stringify(selectedEvent ?? events.slice(0, 12), null, 2)}</pre></div>
      ) : null}
      {tab === "Source" ? (
        <div className="source-view">
          {events.filter((event) => event.source).length ? events.filter((event) => event.source).map((event) => (
            <button key={event.id} onClick={() => onSelectEvent(event.id)}>
              <strong>{event.title}</strong>
              <span>{event.source?.filePath}:{event.source?.line ?? "--"}</span>
            </button>
          )) : <p>No source locations captured for this run.</p>}
        </div>
      ) : null}
    </section>
  );
}

function GraphPanel({ events, issue, actionEvent, startTime, onSelectEvent }: { events: TimelineEvent[]; issue?: PlayLensState["issues"][number]; actionEvent?: TimelineEvent; startTime?: string; onSelectEvent: (eventId: string) => void }) {
  const [view, setView] = useState<"Graph" | "Table">("Graph");
  const [depth, setDepth] = useState(2);
  const [expanded, setExpanded] = useState(false);
  const request = events.find((event) => event.request);
  const response = events.find((event) => (event.request?.status ?? 0) >= 400) ?? request;
  const consoleEvent = events.find((event) => event.kind === "console.message") ?? events.find((event) => event.severity === "warning");
  const graphNodes: Array<GraphNode | undefined> = [
    actionEvent ? { id: actionEvent.id, tone: "action", title: "Action", body: actionEvent.title, meta: formatOffset(actionEvent.timestamp, startTime) } : undefined,
    request ? { id: request.id, tone: "request", title: "Request", body: request.request ? `${request.request.method} ${shortPath(request.request.url)}` : request.title, meta: formatDuration(request.request?.durationMs ?? request.durationMs) } : undefined,
    response ? { id: response.id, tone: "response", title: "Response", body: response.request?.status ? `${response.request.status} ${response.title}` : response.title, meta: formatOffset(response.timestamp, startTime) } : undefined,
    consoleEvent ? { id: consoleEvent.id, tone: "console", title: "Console Error", body: consoleEvent.message, meta: formatOffset(consoleEvent.timestamp, startTime) } : undefined,
    issue ? { id: issue.eventIds[0], tone: "issue", title: "Issue", body: issue.title, meta: formatOffset(issue.detectedAt, startTime) } : undefined,
  ];
  const nodes = graphNodes.filter((node): node is GraphNode => Boolean(node)).slice(0, depth + 3);

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded]);

  return (
    <section className={`console-panel graph-console ${expanded ? "expanded" : ""}`}>
      <div className="drawer-tabs compact-tabs">
        {(["Graph", "Table"] as const).map((tab) => <button key={tab} className={view === tab ? "active" : ""} onClick={() => setView(tab)}>{tab}</button>)}
        {expanded ? <button className="expanded-exit-button" onClick={() => setExpanded(false)}><X size={13} /> Exit full screen</button> : null}
      </div>
      <div className="graph-toolbar">
        <button onClick={() => setDepth((current) => current === 2 ? 3 : current === 3 ? 5 : 2)}>Depth {depth} <ChevronDown size={12} /></button>
        <span>{expanded ? "expanded" : "100%"}</span>
        <button onClick={() => setExpanded((current) => !current)} title={expanded ? "Collapse graph" : "Expand graph"}><Maximize2 size={13} /></button>
      </div>
      {view === "Graph" ? (
        <div className="causal-graph">
          {nodes.length ? nodes.map((node, index) => (
            <div className="graph-node-wrap" key={`${node.title}-${index}`}>
              <button className={`graph-node ${node.tone}`} onClick={() => node.id && onSelectEvent(node.id)} disabled={!node.id}>
                <span>{node.title}</span>
                <strong>{node.body}</strong>
                <em>{node.meta}</em>
              </button>
              {index < nodes.length - 1 ? <ArrowRight className="graph-edge" size={18} /> : null}
            </div>
          )) : <div className="empty-console">No causal graph data captured.</div>}
        </div>
      ) : (
        <div className="graph-table-wrap">
          <table className="evidence-table">
            <thead><tr><th>Type</th><th>Detail</th><th>Time</th></tr></thead>
            <tbody>
              {nodes.map((node, index) => <tr key={`${node.title}-${index}`} onClick={() => node.id && onSelectEvent(node.id)}><td>{node.title}</td><td>{node.body}</td><td>{node.meta}</td></tr>)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function PanelTitle({ title, actions }: { title: string; actions?: ReactNode }) {
  return <header className="console-panel-title"><h2>{title}</h2><div>{actions}</div></header>;
}

function CpuMemoryChart({ metrics }: { metrics: PlayLensState["systemMetrics"] }) {
  const cpuMax = Math.max(...metrics.map((m) => m.cpuPercent), 100);
  const memMax = Math.max(...metrics.map((m) => m.memoryMb), 1);
  const latestCpu = metrics.at(-1)?.cpuPercent ?? 0;
  const latestMem = metrics.at(-1)?.memoryMb ?? 0;
  const cpuPoints = metrics.map((m, i) => `${metrics.length > 1 ? (i / (metrics.length - 1)) * 220 + 10 : 120},${76 - (m.cpuPercent / cpuMax) * 66}`).join(" ");
  const memPoints = metrics.map((m, i) => `${metrics.length > 1 ? (i / (metrics.length - 1)) * 220 + 10 : 120},${76 - (m.memoryMb / memMax) * 66}`).join(" ");

  return (
    <div className="chart-panel compact-chart">
      <h3><Cpu size={12} /> CPU & Memory <span>{latestCpu}% {(latestMem / 1024).toFixed(1)} GB</span></h3>
      {metrics.length ? (
        <svg className="chart-svg" viewBox="0 0 240 86" preserveAspectRatio="none">
          <polyline points={cpuPoints} fill="none" stroke="#f97316" strokeWidth="2" strokeLinejoin="round" />
          <polyline points={memPoints} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      ) : <div className="mini-empty">No system samples captured.</div>}
    </div>
  );
}

function NetworkWaterfall({ events }: { events: TimelineEvent[] }) {
  const maxDuration = Math.max(...events.map((e) => e.request?.durationMs ?? e.durationMs ?? 100), 1);
  return (
    <div className="chart-panel compact-chart">
      <h3><Network size={12} /> Network Waterfall</h3>
      <div className="waterfall-list">
        {events.length ? events.slice(0, 5).map((event) => {
          const dur = event.request?.durationMs ?? event.durationMs ?? 0;
          const pct = Math.max(14, (dur / maxDuration) * 100);
          const status = event.request?.status;
          const barCls = status && status >= 400 ? "error" : status ? "ok" : "pending";
          return (
            <div key={event.id} className="waterfall-row">
              <span className="method">{event.request?.method}</span>
              <strong>{shortPath(event.request?.url)}</strong>
              <div className="waterfall-bar-wrap"><div className={`waterfall-bar ${barCls}`} style={{ width: `${pct}%` }}>{formatDuration(dur)}</div></div>
            </div>
          );
        }) : <div className="mini-empty">No network data.</div>}
      </div>
    </div>
  );
}

function RequestStatusDonut({ counts, total }: { counts: { label: string; value: number; color: string }[]; total: number }) {
  const radius = 25;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="chart-panel compact-chart status-chart">
      <h3>Request Status</h3>
      <div className="donut-wrap">
        <svg className="donut-svg" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
          {counts.map((seg) => {
            const pct = total > 0 ? seg.value / total : 0;
            const dashLen = pct * circumference;
            const segOffset = offset;
            offset += dashLen;
            return <circle key={seg.label} cx="40" cy="40" r={radius} fill="none" stroke={seg.color} strokeWidth="10" strokeDasharray={`${dashLen} ${circumference - dashLen}`} strokeDashoffset={-segOffset} transform="rotate(-90 40 40)" />;
          })}
          <text x="40" y="40" textAnchor="middle" fill="var(--text-primary)" fontSize="12" fontWeight="800">{total}</text>
          <text x="40" y="52" textAnchor="middle" fill="var(--text-muted)" fontSize="8">Total</text>
        </svg>
        <div className="donut-legend">{counts.map((seg) => <div key={seg.label} className="donut-legend-item"><span className="donut-legend-dot" style={{ background: seg.color }} /><span>{seg.label}</span><strong>{seg.value}</strong></div>)}</div>
      </div>
    </div>
  );
}

function EventDensityChart({ events }: { events: TimelineEvent[] }) {
  const buckets = buildDensityBuckets(events, 18);
  const max = Math.max(...buckets, 1);
  return (
    <div className="chart-panel compact-chart">
      <h3>Event Density <span>(events/s)</span></h3>
      <div className="density-bars">{buckets.map((count, i) => <div key={i} className="density-bar" style={{ height: `${Math.max(4, (count / max) * 100)}%` }} />)}</div>
    </div>
  );
}

function buildDensityBuckets(events: TimelineEvent[], bucketCount: number): number[] {
  if (events.length === 0) return Array(bucketCount).fill(0);
  const times = events.map((e) => new Date(e.timestamp).getTime());
  const min = Math.min(...times);
  const max = Math.max(...times);
  const range = max - min || 1;
  const buckets = Array(bucketCount).fill(0);
  for (const t of times) {
    const idx = Math.min(Math.floor(((t - min) / range) * bucketCount), bucketCount - 1);
    buckets[idx]++;
  }
  return buckets;
}

function computeRequestStatusCounts(events: TimelineEvent[]) {
  let ok = 0;
  let redirects = 0;
  let client = 0;
  let errors = 0;
  let pending = 0;
  for (const e of events) {
    const s = e.request?.status;
    if (!s) pending++;
    else if (s >= 500) errors++;
    else if (s >= 400) client++;
    else if (s >= 300) redirects++;
    else ok++;
  }
  return [
    { label: "2xx", value: ok, color: "#22c55e" },
    { label: "3xx", value: redirects, color: "#60a5fa" },
    { label: "4xx", value: client, color: "#f59e0b" },
    { label: "5xx", value: errors, color: "#ef4444" },
    { label: "Pending", value: pending, color: "#8b5cf6" },
  ].filter((s) => s.value > 0);
}
