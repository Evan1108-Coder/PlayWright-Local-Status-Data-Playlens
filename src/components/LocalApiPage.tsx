import { useEffect, useMemo, useState } from "react";
import { Code2, Database, KeyRound, Link2, Lock, Server, Settings2, ShieldCheck } from "lucide-react";
import type { PlayLensState } from "../state/appState";
import { getApiHealth, getApiManifest, getExportUrl, getLocalApiSummary, type ApiHealth, type ApiManifest } from "../lib/apiClient";

interface LocalApiPageProps {
  state: PlayLensState;
}

export function LocalApiPage({ state }: LocalApiPageProps) {
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [manifest, setManifest] = useState<ApiManifest | null>(null);
  const [summary, setSummary] = useState<{ tasks: number; sessions: number; events: number; issues: number; metrics: number; settingsGroups: number; artifacts: number; auditRecords: number; projectScopes: number; aiMessages: number; uploadedFiles: number } | null>(null);
  const [endpointFilter, setEndpointFilter] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([getApiHealth(), getApiManifest(), getLocalApiSummary()]).then(([healthResult, manifestResult, summaryResult]) => {
      if (!active) return;
      if (healthResult.ok) setHealth(healthResult.data ?? null);
      if (manifestResult.ok) setManifest(manifestResult.data ?? null);
      if (summaryResult.ok) setSummary(summaryResult.data ?? null);
    });
    return () => {
      active = false;
    };
  }, []);

  const baseUrl = manifest?.defaultBaseUrl ?? "http://127.0.0.1:4174";
  const apiSettings = state.settingsGroups.find((group) => group.id === "local-api");
  const filteredEndpoints = useMemo(() => {
    const needle = endpointFilter.trim().toLowerCase();
    const endpoints = manifest?.endpoints ?? [];
    if (!needle) return endpoints;
    return endpoints.filter((endpoint) => `${endpoint.method} ${endpoint.path} ${endpoint.description}`.toLowerCase().includes(needle));
  }, [endpointFilter, manifest]);

  const copy = async (label: string, value: string) => {
    await navigator.clipboard?.writeText(value).catch(() => undefined);
    setCopied(label);
    window.setTimeout(() => setCopied((current) => current === label ? null : current), 1400);
  };

  return (
    <section className="local-api-page">
      <div className="page-heading">
        <span className="section-kicker">Local API</span>
        <h2>Code access for PlayLens recordings</h2>
        <p>Read tasks, sessions, events, issues, metrics, settings, and exports from code running on this device.</p>
      </div>

      <div className="api-hero-grid">
        <article className="api-status-panel">
          <h3><Server size={16} /> Server</h3>
          <strong>{health?.ok ? "Online" : "Offline"}</strong>
          <span>{baseUrl}</span>
          <p>{manifest?.auth.note ?? "The local API is designed for loopback access."}</p>
        </article>
        <article className="api-status-panel">
          <h3><Lock size={16} /> Access</h3>
          <strong>{manifest?.localOnly ? "Local only" : "Check host"}</strong>
          <span>{manifest?.auth.required ? "Auth required" : "No token required by default"}</span>
          <p>Keep the bind host at <code>127.0.0.1</code> unless you intentionally expose the API.</p>
        </article>
        <article className="api-status-panel">
          <h3><Database size={16} /> Current Data</h3>
          <strong>{summary?.sessions ?? state.sessions.length} sessions</strong>
          <span>{summary?.events ?? state.events.length} events · {summary?.issues ?? state.issues.length} issues · {summary?.metrics ?? state.systemMetrics.length} metrics · {summary?.artifacts ?? 0} artifacts</span>
          <p>These counts are hydrated from the same source as the dashboard.</p>
        </article>
      </div>

      <div className="api-implementation-grid">
        <article className="api-panel">
          <h3><Code2 size={16} /> JavaScript SDK</h3>
          <pre>{`import { PlayLensClient } from "./src/sdk/client";

const playlens = new PlayLensClient({
  baseUrl: "${baseUrl}"
});

const tasks = await playlens.listTasks();
const events = await playlens.listEvents({ kind: "network.response" });
const issues = await playlens.listIssues();
const metrics = await playlens.listMetrics();
const raw = await playlens.getRawState();`}</pre>
          <button onClick={() => copy("sdk", `import { PlayLensClient } from "./src/sdk/client";\nconst playlens = new PlayLensClient({ baseUrl: "${baseUrl}" });\nconst tasks = await playlens.listTasks();\nconst events = await playlens.listEvents({ kind: "network.response" });\nconst raw = await playlens.getRawState();`)}>
            <Link2 size={13} /> {copied === "sdk" ? "Copied" : "Copy SDK example"}
          </button>
        </article>

        <article className="api-panel">
          <h3><KeyRound size={16} /> Direct HTTP</h3>
          <pre>{`curl ${baseUrl}/api/health
curl ${baseUrl}/api/tasks
curl "${baseUrl}/api/events?kind=network.response&limit=50"
curl ${baseUrl}/api/issues
curl ${baseUrl}/api/metrics
curl ${baseUrl}/api/raw/state
curl ${baseUrl}/api/raw/sessions
curl ${getExportUrl("json")}`}</pre>
          <button onClick={() => copy("curl", `curl ${baseUrl}/api/health\ncurl ${baseUrl}/api/tasks\ncurl "${baseUrl}/api/events?kind=network.response&limit=50"\ncurl ${baseUrl}/api/raw/state`)}> 
            <Link2 size={13} /> {copied === "curl" ? "Copied" : "Copy curl example"}
          </button>
        </article>
      </div>

      <section className="api-endpoints-panel">
        <div className="api-section-header">
          <div>
            <span className="section-kicker">Endpoints</span>
            <h3>Local routes</h3>
          </div>
          <input value={endpointFilter} onChange={(event) => setEndpointFilter(event.target.value)} placeholder="Filter endpoints..." />
        </div>
        <div className="endpoint-list">
          {filteredEndpoints.map((endpoint) => (
            <article key={`${endpoint.method}-${endpoint.path}`} className="endpoint-row">
              <strong>{endpoint.method}</strong>
              <code>{endpoint.path}</code>
              <span>{endpoint.description}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="api-settings-panel">
        <div className="api-section-header">
          <div>
            <span className="section-kicker">Settings</span>
            <h3>API controls synced from Settings</h3>
          </div>
          <Settings2 size={16} />
        </div>
        <div className="api-settings-grid">
          <article className="api-setting-row">
            <ShieldCheck size={14} />
            <div>
              <strong>Project scopes</strong>
              <span>/api/project-scopes</span>
            </div>
            <em>{summary?.projectScopes ?? state.projectScopes.length}</em>
          </article>
          <article className="api-setting-row">
            <ShieldCheck size={14} />
            <div>
              <strong>Audit records</strong>
              <span>/api/audit</span>
            </div>
            <em>{summary?.auditRecords ?? state.auditLog.length}</em>
          </article>
          <article className="api-setting-row">
            <ShieldCheck size={14} />
            <div>
              <strong>AI messages</strong>
              <span>/api/ai/messages</span>
            </div>
            <em>{summary?.aiMessages ?? state.aiAgent.messages.length}</em>
          </article>
          <article className="api-setting-row">
            <ShieldCheck size={14} />
            <div>
              <strong>Uploaded files</strong>
              <span>/api/uploads</span>
            </div>
            <em>{summary?.uploadedFiles ?? state.uploadedFiles.length}</em>
          </article>
          {(apiSettings?.items ?? []).map((item) => (
            <article key={item.id} className="api-setting-row">
              <ShieldCheck size={14} />
              <div>
                <strong>{item.label}</strong>
                <span>{item.path}</span>
              </div>
              <em>{String(item.value)}</em>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}
