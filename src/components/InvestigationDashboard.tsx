import { AlertTriangle, Code2, ExternalLink, Network, TerminalSquare } from "lucide-react";
import type { Task } from "../data/types";
import type { PlayLensState } from "../state/appState";

interface InvestigationDashboardProps {
  state: PlayLensState;
  selectedTask?: Task;
  highlightTargetId: string | null;
  onOpenSettings: () => void;
}

export function InvestigationDashboard({ state, selectedTask, highlightTargetId, onOpenSettings }: InvestigationDashboardProps) {
  const taskEvents = state.events.filter((event) => event.taskId === selectedTask?.id);
  const taskIssues = state.issues.filter((issue) => issue.taskId === selectedTask?.id);
  const metrics = state.systemMetrics.filter((metric) => metric.taskId === selectedTask?.id);
  const selectedIssue = taskIssues[0];

  return (
    <section className="dashboard-grid">
      <div className="timeline-panel">
        <div className="panel-header">
          <div>
            <span className="section-kicker">Timeline</span>
            <h2>{taskEvents.length} recorded events</h2>
          </div>
          <button onClick={onOpenSettings}>Capture Settings</button>
        </div>
        <div className="timeline-list" id="timeline">
          {taskEvents.map((event) => (
            <article key={event.id} className={`timeline-item ${event.severity} ${highlightTargetId === event.id ? "highlight-target" : ""}`}>
              <time>{new Date(event.timestamp).toLocaleTimeString()}</time>
              <div>
                <strong>{event.title}</strong>
                <p>{event.message}</p>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="replay-panel">
        <div className="browser-frame">
          <div className="browser-bar">
            <span />
            <span />
            <span />
            <strong>{selectedTask?.summary.currentUrl ?? "waiting for browser"}</strong>
          </div>
          <div className="checkout-mock">
            <div className="checkout-nav">ShopGrid · Checkout</div>
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
            <div className="error-banner">Payment failed. The processor returned an unavailable response.</div>
          </div>
        </div>

        <div className="graph-row">
          <MetricChart title="CPU" values={metrics.map((metric) => metric.cpuPercent)} suffix="%" />
          <MetricChart title="Memory" values={metrics.map((metric) => Math.round(metric.memoryMb / 10))} suffix="0 MB" />
          <MetricChart title="Network" values={metrics.map((metric) => Math.round((metric.networkRxBytes ?? 0) / 1000))} suffix=" KB" />
        </div>
      </div>

      <aside className="inspector-panel" id="issues">
        <div className="panel-header">
          <div>
            <span className="section-kicker">Issue Focus</span>
            <h2>{selectedIssue?.title ?? "No issue selected"}</h2>
          </div>
          <AlertTriangle size={19} />
        </div>
        {selectedIssue && (
          <div className={`issue-card ${highlightTargetId === selectedIssue.id ? "highlight-target" : ""}`}>
            <span className={`severity ${selectedIssue.severity}`}>{selectedIssue.severity}</span>
            <p>{selectedIssue.description}</p>
            <h3>Evidence</h3>
            {selectedIssue.evidence.map((item) => (
              <div className="evidence-row" key={`${item.label}-${item.value}`}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        )}

        <div className="network-card">
          <h3><Network size={15} /> Network Waterfall</h3>
          {taskEvents.filter((event) => event.request).map((event) => (
            <div key={event.id} className="request-row">
              <span>{event.request?.method}</span>
              <strong>{event.request?.url.split("/").slice(-2).join("/")}</strong>
              <em>{event.request?.status ?? "pending"}</em>
            </div>
          ))}
        </div>
      </aside>

      <div className="bottom-drawer">
        <div className="drawer-tabs">
          <span><TerminalSquare size={14} /> Terminal</span>
          <span><Code2 size={14} /> Raw Events</span>
          <span><ExternalLink size={14} /> Exports</span>
        </div>
        <pre>{`$ npm run test:checkout -- --project=chromium
POST /api/payment 500 processor_unavailable
AssertionError: expected "Order confirmed" heading to be visible`}</pre>
      </div>
    </section>
  );
}

function MetricChart({ title, values, suffix }: { title: string; values: number[]; suffix: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className="metric-chart">
      <strong>{title}</strong>
      <div className="bars">
        {values.map((value, index) => (
          <span key={`${title}-${index}`} style={{ height: `${Math.max(10, (value / max) * 68)}px` }} />
        ))}
      </div>
      <em>{values.at(-1) ?? 0}{suffix}</em>
    </div>
  );
}

