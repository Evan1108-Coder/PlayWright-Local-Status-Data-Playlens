import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  ChevronLeft,
  ChevronRight,
  Code2,
  ExternalLink,
  FileText,
  GitBranch,
  Maximize2,
  MessageSquare,
  Network,
  Send,
  TerminalSquare,
} from "lucide-react";
import type { EventKind, Task, TimelineEvent } from "../data/types";
import type { PlayLensState } from "../state/appState";

interface InvestigationDashboardProps {
  state: PlayLensState;
  selectedTask?: Task;
  highlightTargetId: string | null;
  onOpenSettings: () => void;
}

function eventBadge(kind: EventKind): { label: string; cls: string } {
  const map: Record<string, { label: string; cls: string }> = {
    "task.created": { label: "INFO", cls: "info" },
    "playwright.detected": { label: "INFO", cls: "info" },
    "browser.launched": { label: "INFO", cls: "info" },
    "page.navigated": { label: "NAV", cls: "nav" },
    "action.started": { label: "ACTION", cls: "action" },
    "action.completed": { label: "ACTION", cls: "action" },
    "assertion.failed": { label: "ISSUE", cls: "issue" },
    "network.request": { label: "REQ", cls: "req" },
    "network.response": { label: "RESP", cls: "resp" },
    "console.message": { label: "CONSOLE", cls: "console" },
    "dom.snapshot": { label: "INFO", cls: "info" },
    "accessibility.snapshot": { label: "INFO", cls: "info" },
    "terminal.output": { label: "STEP", cls: "step" },
    "system.metric": { label: "PERF", cls: "perf" },
    "issue.detected": { label: "ISSUE", cls: "issue" },
    "ai.action": { label: "ACTION", cls: "action" },
  };
  return map[kind] ?? { label: "INFO", cls: "info" };
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function InvestigationDashboard({ state, selectedTask, highlightTargetId, onOpenSettings }: InvestigationDashboardProps) {
  const taskEvents = state.events.filter((e) => e.taskId === selectedTask?.id);
  const taskIssues = state.issues.filter((i) => i.taskId === selectedTask?.id);
  const metrics = state.systemMetrics.filter((m) => m.taskId === selectedTask?.id);
  const selectedIssue = taskIssues[0];
  const session = state.sessions.find((s) => s.taskId === selectedTask?.id);

  const networkEvents = taskEvents.filter((e) => e.request);
  const requestStatusCounts = computeRequestStatusCounts(networkEvents);

  return (
    <section className="dashboard-grid">
      {/* ── Timeline Panel ── */}
      <div className="timeline-panel">
        <div className="panel-header">
          <h2>Timeline</h2>
          <button onClick={onOpenSettings}>Settings</button>
        </div>
        <div className="timeline-list" id="timeline">
          {taskEvents.map((event) => {
            const badge = eventBadge(event.kind);
            return (
              <article
                key={event.id}
                className={`timeline-item ${event.severity} ${highlightTargetId === event.id ? "highlight-target" : ""}`}
              >
                <time>{formatTime(event.timestamp)}</time>
                <span className={`event-badge ${badge.cls}`}>{badge.label}</span>
                <div className="event-info">
                  <strong>{event.title}</strong>
                  <p>{event.message}</p>
                </div>
                {event.durationMs != null && (
                  <span className="event-duration">{formatDuration(event.durationMs)}</span>
                )}
              </article>
            );
          })}
          {taskEvents.length === 0 && (
            <p style={{ color: "var(--text-muted)", fontSize: 11, padding: 8 }}>No events recorded for this task.</p>
          )}
        </div>
      </div>

      {/* ── Replay Panel ── */}
      <div className="replay-panel">
        <div className="browser-frame">
          <div className="browser-bar">
            <span /><span /><span />
            <strong>{selectedTask?.name ?? "No task"}</strong>
            <div className="browser-nav-controls">
              <button><ChevronLeft size={12} /></button>
              <button><ChevronRight size={12} /></button>
              <button><Maximize2 size={10} /></button>
            </div>
          </div>
          <div className="browser-url-bar">
            <input readOnly value={selectedTask?.summary.currentUrl ?? ""} />
            {session?.browser?.viewport && (
              <span className="browser-viewport-info">
                {session.browser.viewport.width} × {session.browser.viewport.height}
              </span>
            )}
          </div>
          {taskEvents.length > 0 && selectedTask?.summary.currentUrl ? (
            <div className="checkout-mock">
              <div className="checkout-nav">DemoShop · Checkout</div>
              <div className="checkout-layout">
                <section>
                  <h2>Payment</h2>
                  <label>Card number</label>
                  <div className="fake-input">4242 4242 4242 4242</div>
                  <label>Billing ZIP</label>
                  <div className="fake-input">94107</div>
                  <button>Pay now</button>
                </section>
                <aside>
                  <h3>Order summary</h3>
                  <p>Pro plan · 1 seat</p>
                  <strong>$29.00</strong>
                </aside>
              </div>
              {taskIssues.some((i) => i.severity === "critical") && (
                <div className="error-banner">Payment failed. The processor returned an unavailable response.</div>
              )}
            </div>
          ) : (
            <div className="checkout-mock" style={{ display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>
              {taskEvents.length === 0 ? "No browser session recorded." : "Waiting for browser data..."}
            </div>
          )}
        </div>
      </div>

      {/* ── Causal Chain / Inspector Panel ── */}
      <aside className="inspector-panel" id="issues">
        <div className="causal-header">
          <GitBranch size={14} />
          <h2>Causal Chain</h2>
        </div>

        {selectedIssue && (
          <>
            <div className="selected-action">
              <div className="selected-action-title">
                <strong>{selectedIssue.title}</strong>
                <time>{formatTime(selectedIssue.detectedAt)}</time>
              </div>
              {selectedIssue.source && (
                <dl className="causal-detail">
                  <dt>Source</dt>
                  <dd>{selectedIssue.source.filePath}:{selectedIssue.source.line}</dd>
                </dl>
              )}
            </div>

            <div className={`issue-card ${highlightTargetId === selectedIssue.id ? "highlight-target" : ""}`}>
              <span className={`severity ${selectedIssue.severity}`}>{selectedIssue.severity}</span>
              <p>{selectedIssue.description}</p>
              <h3 style={{ fontSize: 11, margin: "6px 0 4px", color: "var(--text-muted)" }}>Evidence</h3>
              {selectedIssue.evidence.map((item) => (
                <div className="evidence-row" key={`${item.label}-${item.value}`}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="related-artifacts">
          <h3>Related Artifacts</h3>
          {taskEvents.filter((e) => e.relatedIssueIds.length > 0 || e.request).map((event) => {
            const badge = eventBadge(event.kind);
            return (
              <div className="artifact-item" key={event.id}>
                <span className={`event-badge ${badge.cls}`}>{badge.label}</span>
                <div>
                  <span className="artifact-label">{event.title}</span>
                  <span className="artifact-detail">
                    {event.request ? `${event.request.method} ${event.request.url.split("/").pop()}` : event.message.slice(0, 40)}
                  </span>
                </div>
                <span className="artifact-arrow"><ArrowRight size={10} /></span>
              </div>
            );
          })}
        </div>

        <div className="network-card" style={{ marginTop: 8 }}>
          <h3><Network size={13} /> Network</h3>
          {networkEvents.map((event) => (
            <div key={event.id} className="request-row">
              <span>{event.request?.method}</span>
              <strong>{event.request?.url.split("/").slice(-2).join("/")}</strong>
              <em style={{ color: (event.request?.status ?? 0) >= 400 ? "var(--accent-red)" : "var(--accent-green)" }}>
                {event.request?.status ?? "pending"}
              </em>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Charts Row ── */}
      <div className="charts-row">
        <CpuMemoryChart metrics={metrics} />
        <NetworkWaterfall events={networkEvents} />
        <RequestStatusDonut counts={requestStatusCounts} total={networkEvents.length} />
        <EventDensityChart events={taskEvents} />
      </div>

      {/* ── Bottom Drawer ── */}
      <BottomDrawer taskEvents={taskEvents} state={state} selectedTask={selectedTask} />
    </section>
  );
}

/* ── Charts ── */

function CpuMemoryChart({ metrics }: { metrics: PlayLensState["systemMetrics"] }) {
  const cpuMax = Math.max(...metrics.map((m) => m.cpuPercent), 1);
  const memMax = Math.max(...metrics.map((m) => m.memoryMb), 1);
  const latestCpu = metrics.at(-1)?.cpuPercent ?? 0;
  const latestMem = metrics.at(-1)?.memoryMb ?? 0;

  const cpuPoints = metrics.map((m, i) => {
    const x = metrics.length > 1 ? (i / (metrics.length - 1)) * 220 + 10 : 120;
    const y = 70 - (m.cpuPercent / cpuMax) * 60;
    return `${x},${y}`;
  }).join(" ");

  const memPoints = metrics.map((m, i) => {
    const x = metrics.length > 1 ? (i / (metrics.length - 1)) * 220 + 10 : 120;
    const y = 70 - (m.memoryMb / memMax) * 60;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="chart-panel">
      <h3>CPU & Memory</h3>
      <div style={{ display: "flex", gap: 12, marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: "var(--accent-teal)" }}>● CPU {latestCpu}%</span>
        <span style={{ fontSize: 10, color: "var(--accent-orange)" }}>● Mem {(latestMem / 1024).toFixed(1)} GB</span>
      </div>
      {metrics.length > 0 ? (
        <svg className="chart-svg" viewBox="0 0 240 80" preserveAspectRatio="none">
          <polyline points={cpuPoints} fill="none" stroke="#4db7a9" strokeWidth="2" strokeLinejoin="round" />
          <polyline points={memPoints} fill="none" stroke="#f5a623" strokeWidth="2" strokeLinejoin="round" strokeDasharray="4 2" />
        </svg>
      ) : (
        <div style={{ height: 80, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 10 }}>No metrics</div>
      )}
    </div>
  );
}

function NetworkWaterfall({ events }: { events: TimelineEvent[] }) {
  const maxDuration = Math.max(...events.map((e) => e.request?.durationMs ?? e.durationMs ?? 100), 1);

  return (
    <div className="chart-panel">
      <h3>Network Waterfall</h3>
      <div className="waterfall-list">
        {events.map((event) => {
          const dur = event.request?.durationMs ?? event.durationMs ?? 0;
          const pct = Math.max(8, (dur / maxDuration) * 100);
          const status = event.request?.status;
          const barCls = status && status >= 400 ? "error" : status ? "ok" : "pending";
          const statusCls = status && status >= 400 ? "error" : "ok";
          const path = event.request?.url.split("/").slice(3).join("/") || event.request?.url || "";

          return (
            <div key={event.id} className="waterfall-row">
              <span className="method">{event.request?.method}</span>
              <div className="waterfall-bar-wrap">
                <div className={`waterfall-bar ${barCls}`} style={{ width: `${pct}%` }}>
                  /{path.split("/").pop()}
                </div>
              </div>
              <span className={`status-code ${statusCls}`}>{status ?? "…"}</span>
            </div>
          );
        })}
        {events.length === 0 && (
          <span style={{ fontSize: 10, color: "var(--text-muted)" }}>No network requests</span>
        )}
      </div>
    </div>
  );
}

function RequestStatusDonut({ counts, total }: { counts: { label: string; value: number; color: string }[]; total: number }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="chart-panel">
      <h3>Request Status</h3>
      <div className="donut-wrap">
        <svg className="donut-svg" viewBox="0 0 80 80">
          <circle cx="40" cy="40" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
          {counts.map((seg) => {
            const pct = total > 0 ? seg.value / total : 0;
            const dashLen = pct * circumference;
            const dashGap = circumference - dashLen;
            const segOffset = offset;
            offset += dashLen;
            return (
              <circle
                key={seg.label}
                cx="40" cy="40" r={radius}
                fill="none" stroke={seg.color} strokeWidth="8"
                strokeDasharray={`${dashLen} ${dashGap}`}
                strokeDashoffset={-segOffset}
                transform="rotate(-90 40 40)"
              />
            );
          })}
          <text x="40" y="38" textAnchor="middle" fill="var(--text-primary)" fontSize="14" fontWeight="800">{total}</text>
          <text x="40" y="50" textAnchor="middle" fill="var(--text-muted)" fontSize="8">Total</text>
        </svg>
        <div className="donut-legend">
          {counts.map((seg) => (
            <div key={seg.label} className="donut-legend-item">
              <span className="donut-legend-dot" style={{ background: seg.color }} />
              <span>{seg.label}</span>
              <strong>{seg.value}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EventDensityChart({ events }: { events: TimelineEvent[] }) {
  const buckets = buildDensityBuckets(events, 12);
  const max = Math.max(...buckets, 1);

  return (
    <div className="chart-panel">
      <h3>Event Density</h3>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>{events.length} events/s</div>
      <div className="density-bars">
        {buckets.map((count, i) => (
          <div
            key={i}
            className="density-bar"
            style={{ height: `${Math.max(3, (count / max) * 100)}%` }}
          />
        ))}
      </div>
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
  let errors = 0;
  let pending = 0;
  for (const e of events) {
    const s = e.request?.status;
    if (!s) pending++;
    else if (s >= 400) errors++;
    else ok++;
  }
  return [
    { label: "2xx", value: ok, color: "#5dd39e" },
    { label: "5xx", value: errors, color: "#e56d66" },
    { label: "Pending", value: pending, color: "#a88bfa" },
  ].filter((s) => s.value > 0);
}

/* ── Bottom Drawer ── */

type DrawerTab = "ai-chat" | "terminal" | "raw-events" | "source" | "exports";

function BottomDrawer({ taskEvents, state, selectedTask }: { taskEvents: TimelineEvent[]; state: PlayLensState; selectedTask?: Task }) {
  const [activeTab, setActiveTab] = useState<DrawerTab>("terminal");

  const tabs: { key: DrawerTab; label: string; icon: typeof TerminalSquare }[] = [
    { key: "ai-chat", label: "AI Chat", icon: MessageSquare },
    { key: "terminal", label: "Terminal", icon: TerminalSquare },
    { key: "raw-events", label: "Raw Events", icon: Code2 },
    { key: "source", label: "Source", icon: FileText },
    { key: "exports", label: "Exports", icon: ExternalLink },
  ];

  return (
    <div className="bottom-drawer">
      <div className="drawer-tabs">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              className={activeTab === tab.key ? "active" : ""}
              onClick={() => setActiveTab(tab.key)}
            >
              <Icon size={12} /> {tab.label}
            </button>
          );
        })}
      </div>
      <div className="drawer-content">
        {activeTab === "ai-chat" && <AIChatDrawer state={state} />}
        {activeTab === "terminal" && <TerminalDrawer events={taskEvents} />}
        {activeTab === "raw-events" && (
          <pre>{taskEvents.length > 0 ? JSON.stringify(taskEvents, null, 2) : "No events recorded."}</pre>
        )}
        {activeTab === "source" && <SourceDrawer events={taskEvents} />}
        {activeTab === "exports" && <ExportsDrawer state={state} selectedTask={selectedTask} />}
      </div>
    </div>
  );
}

function TerminalDrawer({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return <pre>No terminal output for this task.</pre>;
  }

  return (
    <div className="terminal-lines">
      {events.map((event) => {
        const level = event.severity === "error" || event.severity === "critical" ? "error" : event.severity;
        return (
          <div key={event.id} className="terminal-line">
            <span className="term-time">{formatTime(event.timestamp)}</span>
            <span className={`term-level ${level}`}>{level.toUpperCase()}</span>
            <span className="term-message">{event.message}</span>
          </div>
        );
      })}
    </div>
  );
}

function AIChatDrawer({ state }: { state: PlayLensState }) {
  const messages = state.aiAgent.messages;

  return (
    <div className="ai-chat-drawer">
      <div className="ai-chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`ai-msg ${msg.role}`}>
            {msg.contentMarkdown}
          </div>
        ))}
        {messages.length === 0 && (
          <p style={{ color: "var(--text-muted)", fontSize: 11, textAlign: "center", padding: 16 }}>
            No AI conversations yet. Start by asking about this session.
          </p>
        )}
      </div>
      <div className="ai-chat-input">
        <Bot size={14} style={{ color: "var(--accent-teal)", flexShrink: 0 }} />
        <input placeholder="Ask about this session..." readOnly />
        <button><Send size={12} /></button>
      </div>
    </div>
  );
}

function SourceDrawer({ events }: { events: TimelineEvent[] }) {
  const sourcedEvents = events.filter((e) => e.source);
  if (sourcedEvents.length === 0) {
    return <pre>No source locations recorded for this task.</pre>;
  }

  return (
    <div className="terminal-lines">
      {sourcedEvents.map((event) => (
        <div key={event.id} className="terminal-line">
          <span className="term-time">{event.source?.filePath}:{event.source?.line}</span>
          <span className={`event-badge ${eventBadge(event.kind).cls}`}>{eventBadge(event.kind).label}</span>
          <span className="term-message">{event.title}</span>
        </div>
      ))}
    </div>
  );
}

function ExportsDrawer({ state, selectedTask }: { state: PlayLensState; selectedTask?: Task }) {
  const sessionIds = selectedTask?.sessionIds ?? [];
  const sessions = state.sessions.filter((s) => sessionIds.includes(s.id));

  if (sessions.length === 0) {
    return <pre>No exportable session data for this task.</pre>;
  }

  return (
    <pre>
      {JSON.stringify(
        sessions.map((s) => ({
          id: s.id,
          title: s.title,
          status: s.status,
          browser: s.browser?.name,
          events: s.eventIds.length,
          duration: s.durationMs ? `${(s.durationMs / 1000).toFixed(1)}s` : "n/a",
        })),
        null,
        2
      )}
    </pre>
  );
}
