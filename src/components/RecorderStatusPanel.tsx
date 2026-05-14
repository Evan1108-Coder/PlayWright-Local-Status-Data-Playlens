import { Activity, Bot, CheckCircle2, CircleDashed, FolderCog, Radio, TerminalSquare } from "lucide-react";

interface RecorderStatusPanelProps {
  apiOnline: boolean;
  storageRoot?: string;
}

const recorderRows = [
  {
    icon: TerminalSquare,
    title: "CLI supervisor",
    detail: "Runs commands through playlens run -- <command>, captures stdout/stderr, exit codes, process timing, and system samples.",
    status: "implemented"
  },
  {
    icon: Radio,
    title: "Node preload hook",
    detail: "Injects a register hook so PlayLens can notice playwright and @playwright/test imports inside watched processes.",
    status: "implemented"
  },
  {
    icon: Activity,
    title: "Playwright reporter",
    detail: "Reporter shape records test begin/end, failures, retries, stdout, stderr, and attachments into the same event stream.",
    status: "implemented"
  },
  {
    icon: FolderCog,
    title: "Project scope config",
    detail: "playlens init creates .playlens/project.json with include/exclude, storage, and capture defaults.",
    status: "implemented"
  },
  {
    icon: Bot,
    title: "MiniMax agent adapter",
    detail: "AI stays unavailable until VITE_MINIMAX_API_KEY or MINIMAX_API_KEY is configured; no-key mode never fakes chat responses.",
    status: "ready"
  }
];

export function RecorderStatusPanel({ apiOnline, storageRoot }: RecorderStatusPanelProps) {
  return (
    <section className="recorder-status">
      <div className="panel-header">
        <div>
          <span className="section-kicker">Recorder</span>
          <h2>Capture pipeline status</h2>
        </div>
        <span className={`api-pill ${apiOnline ? "online" : "offline"}`}>
          {apiOnline ? <CheckCircle2 size={14} /> : <CircleDashed size={14} />}
          {apiOnline ? "API online" : "UI fallback"}
        </span>
      </div>
      <div className="recorder-grid">
        {recorderRows.map((row) => {
          const Icon = row.icon;
          return (
            <article key={row.title} className="recorder-row">
              <Icon size={18} />
              <div>
                <strong>{row.title}</strong>
                <p>{row.detail}</p>
              </div>
              <span>{row.status}</span>
            </article>
          );
        })}
      </div>
      <div className="storage-line">
        <strong>Storage root</strong>
        <code>{storageRoot ?? ".playlens-data, once the backend server is running"}</code>
      </div>
    </section>
  );
}
