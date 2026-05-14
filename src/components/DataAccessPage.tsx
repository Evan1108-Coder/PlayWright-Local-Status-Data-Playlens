import { useEffect, useState } from "react";
import { Code2, Database, Download, Server, TerminalSquare } from "lucide-react";
import type { PlayLensState } from "../state/appState";
import {
  getApiHealth,
  getExportUrl,
  getStoredSessions,
  type ApiHealth,
  type StoredSessionSummary
} from "../lib/apiClient";
import { RecorderStatusPanel } from "./RecorderStatusPanel";

interface DataAccessPageProps {
  state: PlayLensState;
}

export function DataAccessPage({ state }: DataAccessPageProps) {
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [sessions, setSessions] = useState<StoredSessionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([getApiHealth(), getStoredSessions()]).then(([healthResult, sessionsResult]) => {
      if (!active) return;
      if (healthResult.ok) setHealth(healthResult.data ?? null);
      if (sessionsResult.ok) setSessions(sessionsResult.data ?? []);
      if (!healthResult.ok) setError(healthResult.error ?? "Backend is not reachable");
    });
    return () => {
      active = false;
    };
  }, []);

  const fallbackSessions: StoredSessionSummary[] = state.sessions.map((session) => ({
    id: session.id,
    taskId: session.taskId,
    title: session.title,
    status: session.status,
    eventCount: session.eventIds.length,
    artifactCount: state.events.filter((event) => event.sessionId === session.id).flatMap((event) => event.artifactIds).length,
    issueCount: session.issueIds.length,
    startedAt: session.startedAt,
    endedAt: session.endedAt
  }));
  const visibleSessions = sessions.length > 0 ? sessions : fallbackSessions;

  return (
    <section className="data-page">
      <div className="page-heading">
        <span className="section-kicker">Data Access</span>
        <h2>SDK, API, exports, and local session storage</h2>
        <p>Everything PlayLens records is shaped for code access, not only UI inspection.</p>
      </div>

      <RecorderStatusPanel apiOnline={Boolean(health?.ok)} storageRoot={health?.storageRoot} />

      <div className="data-access-grid">
        <article className="data-panel">
          <h3><Server size={16} /> Local API</h3>
          <p>{health?.ok ? "Backend server is reachable." : error ?? "Using frontend fallback data until the server starts."}</p>
          <pre>{`GET /api/health
GET /api/state
GET /api/sessions
GET /api/export?format=json`}</pre>
        </article>

        <article className="data-panel">
          <h3><TerminalSquare size={16} /> Recorder Commands</h3>
          <pre>{`npm run api
npm run dev -- --port 5174
npm run playlens -- init /path/to/project
npm run playlens -- run -- npm run test:e2e
npm run playlens -- export --format markdown`}</pre>
        </article>

        <article className="data-panel">
          <h3><Code2 size={16} /> SDK Shape</h3>
          <pre>{`import { PlayLensClient } from "playlens";

const client = new PlayLensClient();
const state = await client.getState();
const sessions = await client.listSessions();`}</pre>
        </article>

        <article className="data-panel">
          <h3><Download size={16} /> Exports</h3>
          <div className="export-links">
            <a href={getExportUrl("json")}>JSON</a>
            <a href={getExportUrl("ndjson")}>NDJSON</a>
            <a href={getExportUrl("markdown")}>Markdown</a>
          </div>
        </article>
      </div>

      <section className="session-table">
        <h3><Database size={16} /> Sessions</h3>
        {visibleSessions.map((session) => (
          <div className="session-row" key={session.id}>
            <strong>{session.title}</strong>
            <span>{session.status}</span>
            <span>{session.eventCount} events</span>
            <span>{session.issueCount ?? 0} issues</span>
          </div>
        ))}
      </section>
    </section>
  );
}
