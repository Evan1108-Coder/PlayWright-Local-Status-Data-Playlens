import type { ReactNode } from "react";
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
  Smartphone,
  TerminalSquare,
  Zap,
} from "lucide-react";
import type { EventKind, Task, TimelineEvent } from "../data/types";
import type { PlayLensState } from "../state/appState";

interface InvestigationDashboardProps {
  state: PlayLensState;
  selectedTask?: Task;
  highlightTargetId: string | null;
  onOpenSettings: () => void;
}

type BadgeTone = "info" | "step" | "nav" | "action" | "req" | "resp" | "console" | "perf" | "issue";

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
  if (!url) return "/checkout/payment";
  try {
    return new URL(url).pathname;
  } catch {
    return url.replace(/^https?:\/\/[^/]+/, "") || url;
  }
}

export function InvestigationDashboard({ state, selectedTask, highlightTargetId }: InvestigationDashboardProps) {
  const taskEvents = state.events.filter((e) => e.taskId === selectedTask?.id);
  const taskIssues = state.issues.filter((i) => i.taskId === selectedTask?.id);
  const metrics = state.systemMetrics.filter((m) => m.taskId === selectedTask?.id);
  const session = state.sessions.find((s) => s.taskId === selectedTask?.id);
  const selectedIssue = taskIssues[0];
  const networkEvents = taskEvents.filter((e) => e.request);
  const actionEvent = taskEvents.find((e) => e.kind === "action.completed" || e.kind === "action.started") ?? taskEvents.find((e) => e.source) ?? taskEvents[0];
  const startTime = taskEvents[0]?.timestamp ?? session?.startedAt;
  const activeTime = actionEvent ? formatOffset(actionEvent.timestamp, startTime) : "00:00.000";

  return (
    <section className="observability-console" aria-label="PlayLens browser investigation dashboard">
      <TimelinePanel events={taskEvents} startTime={startTime} highlightTargetId={highlightTargetId} />
      <ReplayPanel selectedTask={selectedTask} session={session} selectedIssue={selectedIssue} activeTime={activeTime} events={taskEvents} />
      <CausalPanel events={taskEvents} issue={selectedIssue} actionEvent={actionEvent} startTime={startTime} />
      <MetricsPanel metrics={metrics} networkEvents={networkEvents} events={taskEvents} />
      <AICompactPanel state={state} issue={selectedIssue} />
      <TerminalPanel events={taskEvents} />
      <GraphPanel events={taskEvents} issue={selectedIssue} actionEvent={actionEvent} startTime={startTime} />
    </section>
  );
}

function TimelinePanel({ events, startTime, highlightTargetId }: { events: TimelineEvent[]; startTime?: string; highlightTargetId: string | null }) {
  return (
    <aside className="console-panel timeline-console">
      <PanelTitle title="Timeline" actions={<><Zap size={13} /><Code2 size={13} /></>} />
      <div className="timeline-track">
        {events.map((event) => {
          const badge = eventBadge(event.kind);
          return (
            <article key={event.id} className={`console-event ${badge.cls} ${highlightTargetId === event.id ? "highlight-target" : ""}`}>
              <span className="event-dot" />
              <time>{formatOffset(event.timestamp, startTime)}</time>
              <div className="event-copy">
                <strong>{event.title}</strong>
                <p>{event.message}</p>
              </div>
              <span className={`event-badge ${badge.cls}`}>{badge.label}</span>
              <em>{formatDuration(event.durationMs)}</em>
            </article>
          );
        })}
        {events.length === 0 ? <div className="empty-console">No events recorded for this task.</div> : null}
      </div>
    </aside>
  );
}

function ReplayPanel({ selectedTask, session, selectedIssue, activeTime, events }: {
  selectedTask?: Task;
  session?: PlayLensState["sessions"][number];
  selectedIssue?: PlayLensState["issues"][number];
  activeTime: string;
  events: TimelineEvent[];
}) {
  const currentUrl = selectedTask?.summary.currentUrl ?? "https://demo.shop.test/checkout/payment";
  const viewport = session?.browser.viewport;

  return (
    <section className="console-panel replay-console">
      <div className="console-tabs">
        {['Replay', 'DOM', 'Console', 'Network', 'Logs'].map((tab, index) => <button key={tab} className={index === 0 ? 'active' : ''}>{tab}</button>)}
      </div>
      <div className="replay-toolbar">
        <button><ChevronLeft size={13} /></button>
        <button><ChevronRight size={13} /></button>
        <button><RotateCcw size={12} /></button>
        <div className="url-field">{currentUrl}</div>
        <button><Smartphone size={13} /></button>
        <button>{viewport ? `${viewport.width} x ${viewport.height}` : '1280 x 800'} <ChevronDown size={12} /></button>
        <button><Monitor size={13} /></button>
      </div>
      <div className="browser-canvas">
        <div className="shop-page">
          <div className="shop-header"><strong>DemoShop</strong><span>Secure checkout</span></div>
          <div className="checkout-steps"><span>Shipping</span><strong>Payment</strong><span>Review</span></div>
          <main className="payment-page">
            <section className="payment-form">
              <h2>Payment</h2>
              <p>Complete your purchase</p>
              {selectedIssue ? (
                <div className="payment-alert"><AlertTriangle size={14} /> <strong>We couldn't process your payment</strong><span>Error code 500</span></div>
              ) : null}
              <div className="form-grid">
                <label>Card number<div>4242 4242 4242 4242 <b>VISA</b></div></label>
                <label>Expiry<div>12 / 24</div></label>
                <label>CVC<div>123</div></label>
                <label>Name on card<div>John Doe</div></label>
              </div>
            </section>
            <aside className="order-card">
              <h3>Order summary</h3>
              <p><span>Subtotal</span><strong>$129.99</strong></p>
              <p><span>Shipping</span><strong>$5.99</strong></p>
              <p><span>Tax</span><strong>$10.40</strong></p>
              <p className="order-total"><span>Total</span><strong>$146.38</strong></p>
              <button>Pay now</button>
              <small>button[role='button'] getByRole('button', &#123; name: 'Pay now' &#125;)</small>
            </aside>
          </main>
        </div>
      </div>
      <div className="replay-footer">
        <div className="transport"><ChevronLeft size={12} /><Play size={12} /><ChevronRight size={12} /></div>
        <strong>{activeTime}</strong><span>/ {formatDuration(selectedTask?.summary.durationMs ?? session?.durationMs)}</span>
        <div className="scrubber"><span style={{ width: `${Math.min(92, Math.max(22, events.length * 8))}%` }} /></div>
        <span>1x</span><Maximize2 size={13} />
      </div>
    </section>
  );
}

function CausalPanel({ events, issue, actionEvent, startTime }: { events: TimelineEvent[]; issue?: PlayLensState["issues"][number]; actionEvent?: TimelineEvent; startTime?: string }) {
  const artifacts = events.filter((event) => event.request || event.relatedIssueIds.length || event.kind === "console.message" || event.kind === "dom.snapshot").slice(0, 6);

  return (
    <aside className="console-panel causal-console">
      <PanelTitle title="Causal Chain" actions={<><GitBranch size={13} /><Code2 size={13} /></>} />
      <div className="selected-action-card">
        <span>Selected Action</span>
        <strong>{actionEvent?.title ?? "No action selected"}<time>{actionEvent ? formatOffset(actionEvent.timestamp, startTime) : "--"}</time></strong>
        <dl>
          <dt>Source</dt><dd>{issue?.source ? `${issue.source.filePath}:${issue.source.line}` : actionEvent?.source ? `${actionEvent.source.filePath}:${actionEvent.source.line}` : "checkout.spec.ts:42"}</dd>
          <dt>Locator</dt><dd>{actionEvent?.locator ?? "getByRole('button', { name: 'Pay now' })"}</dd>
          <dt>Element</dt><dd>&lt;button class=&quot;btn primary&quot;&gt;Pay now&lt;/button&gt;</dd>
        </dl>
      </div>
      <StatePreview title="Before State" compact />
      <StatePreview title="After State" failed={Boolean(issue)} />
      <div className="related-list">
        <h3>Related Artifacts</h3>
        {artifacts.map((event) => {
          const badge = eventBadge(event.kind);
          return (
            <button key={event.id}>
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

function StatePreview({ title, compact, failed }: { title: string; compact?: boolean; failed?: boolean }) {
  return (
    <div className="state-preview">
      <h3>{title}</h3>
      <div className={`state-thumb ${failed ? 'failed' : ''} ${compact ? 'compact' : ''}`}>
        <div className="mini-shop-header" />
        <div className="mini-layout"><span /><span /><span /></div>
        {failed ? <div className="mini-alert" /> : null}
        <button />
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

function AICompactPanel({ state, issue }: { state: PlayLensState; issue?: PlayLensState["issues"][number] }) {
  const prompts = [
    issue ? "Why did the payment request fail?" : "What changed in this run?",
    "Show all errors and related requests",
    "What changed in the DOM after the error?",
  ];

  return (
    <section className="console-panel ai-console">
      <div className="drawer-tabs compact-tabs"><button className="active">AI Chat <span>BETA</span></button><button>Exports</button><button>Plugins</button></div>
      <div className="ai-prompt-stack">
        <p>Ask about this session...</p>
        {prompts.map((prompt) => <button key={prompt}>{prompt}</button>)}
      </div>
      <div className="ai-chat-input compact-input"><input readOnly placeholder="Ask about this session..." /><button><Send size={14} /></button></div>
    </section>
  );
}

function TerminalPanel({ events }: { events: TimelineEvent[] }) {
  return (
    <section className="console-panel terminal-console">
      <div className="drawer-tabs compact-tabs"><button className="active">Terminal</button><button>Raw Events</button><button>Source</button></div>
      <div className="terminal-toolbar"><span>bash</span><TerminalSquare size={13} /><Code2 size={13} /></div>
      <div className="terminal-lines console-terminal-lines">
        {events.map((event) => {
          const level = event.severity === "critical" || event.severity === "error" ? "error" : event.severity;
          return (
            <div key={event.id} className="terminal-line">
              <span className="term-time">{formatClock(event.timestamp)}</span>
              <span className={`term-level ${level}`}>{level.toUpperCase()}</span>
              <span className="term-message">{event.message}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function GraphPanel({ events, issue, actionEvent, startTime }: { events: TimelineEvent[]; issue?: PlayLensState["issues"][number]; actionEvent?: TimelineEvent; startTime?: string }) {
  const request = events.find((event) => event.request);
  const response = events.find((event) => (event.request?.status ?? 0) >= 400) ?? request;
  const consoleEvent = events.find((event) => event.kind === "console.message") ?? events.find((event) => event.severity === "warning");
  const nodes = [
    { tone: "action", title: "Action", body: actionEvent?.title ?? "Click Pay now", meta: actionEvent ? formatOffset(actionEvent.timestamp, startTime) : "00:15.984" },
    { tone: "request", title: "Request", body: request?.request ? `${request.request.method} ${shortPath(request.request.url)}` : "POST /api/payment", meta: request ? formatDuration(request.request?.durationMs ?? request.durationMs) : "412ms" },
    { tone: "response", title: "Response", body: response?.request?.status ? `${response.request.status} Internal Server Error` : "500 Internal Server Error", meta: response ? formatOffset(response.timestamp, startTime) : "00:16.516" },
    { tone: "console", title: "Console Error", body: consoleEvent?.message ?? "TypeError: Cannot read properties", meta: consoleEvent ? formatOffset(consoleEvent.timestamp, startTime) : "00:16.602" },
    { tone: "issue", title: "Issue", body: issue?.title ?? "Payment failed with 500", meta: issue ? formatOffset(issue.detectedAt, startTime) : "00:17.240" },
  ];

  return (
    <section className="console-panel graph-console">
      <div className="drawer-tabs compact-tabs"><button className="active">Graph</button><button>Table</button></div>
      <div className="graph-toolbar"><button>Depth 2 <ChevronDown size={12} /></button><span>100%</span><Maximize2 size={13} /></div>
      <div className="causal-graph">
        {nodes.map((node, index) => (
          <div className="graph-node-wrap" key={node.title}>
            <article className={`graph-node ${node.tone}`}>
              <span>{node.title}</span>
              <strong>{node.body}</strong>
              <em>{node.meta}</em>
            </article>
            {index < nodes.length - 1 ? <ArrowRight className="graph-edge" size={18} /> : null}
          </div>
        ))}
      </div>
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
      <svg className="chart-svg" viewBox="0 0 240 86" preserveAspectRatio="none">
        <polyline points={cpuPoints} fill="none" stroke="#f97316" strokeWidth="2" strokeLinejoin="round" />
        <polyline points={memPoints} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function NetworkWaterfall({ events }: { events: TimelineEvent[] }) {
  const maxDuration = Math.max(...events.map((e) => e.request?.durationMs ?? e.durationMs ?? 100), 1);
  return (
    <div className="chart-panel compact-chart">
      <h3><Network size={12} /> Network Waterfall</h3>
      <div className="waterfall-list">
        {events.slice(0, 5).map((event) => {
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
        })}
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
