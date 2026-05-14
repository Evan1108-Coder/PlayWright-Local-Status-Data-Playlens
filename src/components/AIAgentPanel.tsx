import { useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Bot,
  CheckCircle2,
  CircleStop,
  FileText,
  History,
  KeyRound,
  Loader2,
  Pause,
  Play,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Upload,
} from "lucide-react";
import { createMiniMaxAdapter, MiniMaxUnavailableError, type MiniMaxContextSource, type MiniMaxMessage } from "../agent/minimaxAdapter";
import {
  ingestFile,
  SUPPORTED_UPLOAD_EXTENSIONS,
  type IngestedFile,
  type IngestibleFileLike,
} from "../agent/fileIngestion";

export type AgentMode = "read-only" | "ask-before-acting" | "trusted-actions" | "full-operator";
export type AgentStatus = "idle" | "running" | "paused" | "stopped";

export interface AgentPermission {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  danger?: boolean;
}

export interface AgentActivityStep {
  id: string;
  title: string;
  detail: string;
  status: "queued" | "running" | "complete" | "blocked";
  timestamp: string;
}

interface UploadedStateFile {
  id: string;
  fileName?: string;
  name?: string;
  extension: string;
  mimeType?: string;
  sizeBytes?: number;
  size?: number;
  uploadedAt?: string;
  extractedSummary?: string;
}

export interface AIAgentPanelProps {
  state?: {
    aiAgent?: {
      mode?: AgentMode;
      status?: AgentStatus | "waiting-for-approval";
      availableActions?: Array<{
        id: string;
        label: string;
        description: string;
        enabled: boolean;
        dangerous?: boolean;
      }>;
      messages?: Array<{ contentMarkdown?: string; content?: string }>;
    };
    uploadedFiles?: UploadedStateFile[];
  };
  highlightTargetId?: string | null;
  mode?: AgentMode;
  status?: AgentStatus;
  permissions?: AgentPermission[];
  activitySteps?: AgentActivityStep[];
  uploadedFiles?: IngestedFile[];
  contextSources?: MiniMaxContextSource[];
  sampleMessage?: string;
  onModeChange?: (mode: AgentMode) => void;
  onPause?: () => void;
  onStop?: () => void;
  onResume?: () => void;
  onClearHistory?: () => void;
  onFilesIngested?: (files: IngestedFile[]) => void;
  onAsk?: (message: string) => void;
}

const defaultPermissions: AgentPermission[] = [
  {
    id: "read-recordings",
    label: "Read recordings",
    description: "Tasks, sessions, timeline events, DOM, network, console, terminal, metrics, and artifacts.",
    enabled: true,
  },
  {
    id: "read-architecture",
    label: "Read app architecture",
    description: "Data model, settings schema, action registry, and plugin metadata. Source code remains excluded.",
    enabled: true,
  },
  {
    id: "change-settings",
    label: "Change settings",
    description: "Update capture, dashboard, privacy, retention, and AI agent settings through typed app tools.",
    enabled: true,
  },
  {
    id: "operate-tasks",
    label: "Operate tasks",
    description: "Create, rename, pin, pause, resume, archive, and open tasks.",
    enabled: true,
  },
  {
    id: "delete-data",
    label: "Delete/reset data",
    description: "Clear histories, artifacts, AI memory, or reset local databases. Requires confirmation.",
    enabled: false,
    danger: true,
  },
];

const defaultActivity: AgentActivityStep[] = [
  {
    id: "step-context",
    title: "Loaded active task context",
    detail: "Read timeline, selected issue, failed request, terminal tail, and dashboard layout state.",
    status: "complete",
    timestamp: "16:54:12",
  },
  {
    id: "step-network",
    title: "Correlated failure evidence",
    detail: "Linked click action to POST /api/payment, 500 response, console error, and checkout banner update.",
    status: "complete",
    timestamp: "16:54:14",
  },
  {
    id: "step-approval",
    title: "Waiting for approval",
    detail: "Agent wants to pin the payment failure and create a saved Network Errors filter.",
    status: "blocked",
    timestamp: "16:54:16",
  },
];

const defaultMessage = [
  "## Payment Failure Summary",
  "",
  "The checkout task failed after the **Submit payment** action. The strongest signal is the `POST /api/payment` request returning **500** while the UI rendered `Checkout Flow Failure`.",
  "",
  "---",
  "",
  "- The locator was stable before the click.",
  "- The response body suggests a payment processor timeout.",
  "- Terminal logs show the mock API retried twice.",
  "",
  "[Open failed request](playlens://network/req-payment-500)",
].join("\n");

const modeLabels: Record<AgentMode, string> = {
  "read-only": "Read Only",
  "ask-before-acting": "Ask Before Acting",
  "trusted-actions": "Trusted Actions",
  "full-operator": "Full Operator",
};

const statusLabels: Record<AgentStatus, string> = {
  idle: "Idle",
  running: "Running",
  paused: "Paused",
  stopped: "Stopped",
};

export function AIAgentPanel({
  state,
  highlightTargetId,
  mode = "ask-before-acting",
  status = "running",
  permissions = defaultPermissions,
  activitySteps = defaultActivity,
  uploadedFiles,
  contextSources = [],
  sampleMessage = defaultMessage,
  onModeChange,
  onPause,
  onStop,
  onResume,
  onClearHistory,
  onFilesIngested,
  onAsk,
}: AIAgentPanelProps) {
  const resolvedMode = state?.aiAgent?.mode ?? mode;
  const resolvedStatus = normalizeAgentStatus(state?.aiAgent?.status ?? status);
  const resolvedPermissions = state?.aiAgent?.availableActions?.length
    ? state.aiAgent.availableActions.map((action) => ({
        id: action.id,
        label: action.label,
        description: action.description,
        enabled: action.enabled,
        danger: action.dangerous,
      }))
    : permissions;
  const resolvedFiles = uploadedFiles ?? mapUploadedFiles(state?.uploadedFiles);
  const latestStateMessage = findLatestAgentMessage(state?.aiAgent?.messages);

  const [localMode, setLocalMode] = useState<AgentMode>(resolvedMode);
  const [localStatus, setLocalStatus] = useState<AgentStatus>(resolvedStatus);
  const [localFiles, setLocalFiles] = useState<IngestedFile[]>(resolvedFiles);
  const [prompt, setPrompt] = useState("Find the root cause and suggest the safest next action.");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const adapter = useMemo(() => createMiniMaxAdapter(), []);
  const activeStatus = localStatus;
  const aiAvailable = adapter.configured;
  const unavailableMessage = [
    "## AI Unavailable",
    "",
    "MiniMax API key is not configured, so AI chat, file context, and agent actions are disabled.",
    "",
    "Settings can still be edited and saved. AI-related settings will only take effect after `VITE_MINIMAX_API_KEY` or `MINIMAX_API_KEY` is provided and PlayLens is restarted.",
  ].join("\n");
  const [assistantMessage, setAssistantMessage] = useState(
    aiAvailable ? latestStateMessage?.contentMarkdown ?? latestStateMessage?.content ?? sampleMessage : unavailableMessage,
  );
  const accept = useMemo(() => SUPPORTED_UPLOAD_EXTENSIONS.map((extension) => `.${extension}`).join(","), []);
  const enabledPermissionCount = resolvedPermissions.filter((permission) => permission.enabled).length;
  const isHighlighted = highlightTargetId === "ai-agent" || highlightTargetId === "agent-permissions";

  const setMode = (nextMode: AgentMode) => {
    if (!aiAvailable) return;
    setLocalMode(nextMode);
    onModeChange?.(nextMode);
  };

  const pauseAgent = () => {
    if (!aiAvailable) return;
    setLocalStatus("paused");
    onPause?.();
  };

  const stopAgent = () => {
    if (!aiAvailable) return;
    setLocalStatus("stopped");
    onStop?.();
  };

  const resumeAgent = () => {
    if (!aiAvailable) return;
    setLocalStatus("running");
    onResume?.();
  };

  const clearHistory = () => {
    setAssistantMessage("## Chat History Cleared\n\nThe current AI transcript has been cleared locally. Recorded task evidence remains unchanged.");
    onClearHistory?.();
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files?.length) {
      return;
    }
    if (!aiAvailable) {
      setUploadError("MiniMax API key is missing. File upload context becomes available after the key is configured.");
      return;
    }

    setUploadError(null);
    try {
      const ingested = await Promise.all(Array.from(files).map((file) => ingestFile(file as IngestibleFileLike)));
      setLocalFiles((current) => [...ingested, ...current]);
      onFilesIngested?.(ingested);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Unable to ingest uploaded files.");
    } finally {
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  };

  const askAgent = async () => {
    if (!aiAvailable) {
      setAssistantMessage(unavailableMessage);
      return;
    }

    setIsThinking(true);
    setLocalStatus("running");
    onAsk?.(prompt);

    const messages: MiniMaxMessage[] = [
      {
        role: "system",
        content: "You are the PlayLens Browser Dashboard operator agent. Analyze evidence and suggest safe typed app actions.",
      },
      { role: "user", content: prompt },
    ];

    try {
      const response = await adapter.complete({
        messages,
        contextSources,
        files: localFiles,
      });
      setAssistantMessage(response.content);
    } catch (error) {
      setAssistantMessage([
        "## AI Request Failed",
        "",
        error instanceof MiniMaxUnavailableError
          ? "MiniMax API key is not configured. AI chat is disabled until the key is provided."
          : error instanceof Error
            ? error.message
            : "Unknown MiniMax request failure.",
      ].join("\n"));
    } finally {
      setIsThinking(false);
    }
  };

  return (
    <section style={{ ...styles.panel, ...(isHighlighted ? styles.highlighted : undefined) }} aria-label="AI operator agent">
      <header style={styles.header}>
        <div style={styles.headerTitle}>
          <div style={styles.agentIcon}>
            <Bot size={18} />
          </div>
          <div>
            <h2 style={styles.title}>AI Operator</h2>
            <p style={styles.subtitle}>{aiAvailable ? "MiniMax API key detected" : "MiniMax API key missing · AI disabled"}</p>
          </div>
        </div>
        <span style={{ ...styles.statusPill, ...(aiAvailable ? statusStyle(activeStatus) : styles.unavailablePill) }}>
          {aiAvailable ? statusLabels[activeStatus] : "Unavailable"}
        </span>
      </header>

      {!aiAvailable ? (
        <div style={styles.unavailableBanner}>
          <KeyRound size={16} />
          <div>
            <strong>MiniMax API key required</strong>
            <p>AI chat, uploads, and agent actions are disabled until a key is provided. Settings can be changed and saved, but AI-related changes remain pending.</p>
          </div>
        </div>
      ) : null}

      <div style={styles.modeGrid}>
        {(Object.keys(modeLabels) as AgentMode[]).map((item) => (
          <button
            key={item}
            type="button"
            disabled={!aiAvailable}
            onClick={() => setMode(item)}
            style={{
              ...styles.modeButton,
              ...(item === localMode ? styles.modeButtonActive : undefined),
            }}
          >
            {modeLabels[item]}
          </button>
        ))}
      </div>

      <div style={styles.controlRow}>
        <button type="button" style={styles.iconButton} onClick={pauseAgent} title="Pause agent" disabled={!aiAvailable}>
          <Pause size={15} />
          Pause
        </button>
        <button type="button" style={styles.iconButton} onClick={resumeAgent} title="Resume agent" disabled={!aiAvailable}>
          <Play size={15} />
          Resume
        </button>
        <button type="button" style={styles.iconButtonDanger} onClick={stopAgent} title="Stop agent" disabled={!aiAvailable}>
          <CircleStop size={15} />
          Stop
        </button>
        <button type="button" style={styles.iconButton} onClick={clearHistory} title="Clear AI chat history">
          <Trash2 size={15} />
          Clear
        </button>
      </div>

      <div style={styles.sectionHeader}>
        <span style={styles.sectionLabel}>
          <ShieldCheck size={15} />
          Permissions
        </span>
        <span style={styles.muted}>{enabledPermissionCount}/{resolvedPermissions.length} enabled</span>
      </div>

      <div style={styles.permissionList}>
        {resolvedPermissions.map((permission) => (
          <div key={permission.id} style={styles.permissionItem}>
            <div style={{ ...styles.permissionDot, background: permission.enabled ? (permission.danger ? "#f59e0b" : "#22c55e") : "#5b6475" }} />
            <div>
              <div style={styles.permissionTitle}>{permission.label}</div>
              <div style={styles.permissionDescription}>{permission.description}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={styles.sectionHeader}>
        <span style={styles.sectionLabel}>
          <History size={15} />
          Activity
        </span>
        <span style={styles.muted}>{activitySteps.length} steps</span>
      </div>

      <div style={styles.activityList}>
        {activitySteps.map((step) => (
          <div key={step.id} style={styles.activityItem}>
            <div style={styles.activityRail}>
              {step.status === "running" ? <Loader2 size={14} /> : <CheckCircle2 size={14} />}
            </div>
            <div>
              <div style={styles.activityTitle}>
                {step.title}
                <span style={{ ...styles.stepStatus, ...stepStatusStyle(step.status) }}>{step.status}</span>
              </div>
              <p style={styles.activityDetail}>{step.detail}</p>
              <span style={styles.muted}>{step.timestamp}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={styles.promptBox}>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          rows={3}
          style={styles.textarea}
          aria-label="Message AI operator"
          disabled={!aiAvailable}
        />
        <button type="button" onClick={askAgent} style={{ ...styles.askButton, ...(!aiAvailable ? styles.disabledButton : undefined) }} disabled={isThinking || !aiAvailable}>
          {isThinking ? <Loader2 size={15} /> : <SlidersHorizontal size={15} />}
          Ask Agent
        </button>
      </div>

      <div style={styles.messageCard}>
        <RichText content={assistantMessage} />
      </div>

      <div style={styles.uploadHeader}>
        <span style={styles.sectionLabel}>
          <FileText size={15} />
          Uploaded Context
        </span>
        <button type="button" style={styles.uploadButton} onClick={() => inputRef.current?.click()} disabled={!aiAvailable}>
          <Upload size={15} />
          Upload
        </button>
        <input ref={inputRef} type="file" multiple accept={accept} style={styles.fileInput} onChange={(event) => handleUpload(event.target.files)} />
      </div>

      {uploadError ? <div style={styles.error}>{uploadError}</div> : null}

      <div style={styles.fileList}>
        {localFiles.length ? (
          localFiles.map((file) => (
            <div key={file.id} style={styles.fileItem}>
              <div>
                <div style={styles.fileName}>{file.name}</div>
                <div style={styles.permissionDescription}>{file.kind} · {(file.size / 1024).toFixed(1)} KB</div>
              </div>
              <span style={styles.fileBadge}>.{file.extension}</span>
            </div>
          ))
        ) : (
          <div style={styles.emptyFiles}>Supports .txt, .md, .csv, .json, .html, .pdf, .png, .jpg, and .jpeg.</div>
        )}
      </div>

      <footer style={styles.footer}>
        <KeyRound size={14} />
        Agent actions should route through typed app tools and audit logs before touching real data.
      </footer>
    </section>
  );
}

function RichText({ content }: { content: string }) {
  return (
    <div style={styles.richText}>
      {content.split(/\n/).map((line, index) => {
        const key = `${index}-${line}`;
        if (!line.trim()) {
          return <div key={key} style={styles.spacer} />;
        }
        if (line.startsWith("## ")) {
          return <h3 key={key} style={styles.richHeading}>{renderInline(line.slice(3))}</h3>;
        }
        if (line.startsWith("### ")) {
          return <h4 key={key} style={styles.richSubheading}>{renderInline(line.slice(4))}</h4>;
        }
        if (/^-{3,}$/.test(line.trim())) {
          return <div key={key} style={styles.divider} />;
        }
        if (line.startsWith("- ")) {
          return <div key={key} style={styles.bullet}><span>•</span><span>{renderInline(line.slice(2))}</span></div>;
        }
        if (line.startsWith("> ")) {
          return <blockquote key={key} style={styles.quote}>{renderInline(line.slice(2))}</blockquote>;
        }
        return <p key={key} style={styles.paragraph}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={`${part}-${index}`}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={`${part}-${index}`} style={styles.inlineCode}>{part.slice(1, -1)}</code>;
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a key={`${part}-${index}`} href={linkMatch[2]} style={styles.link}>
          {linkMatch[1]}
        </a>
      );
    }
    return part;
  });
}

function statusStyle(status: AgentStatus) {
  if (status === "running") {
    return { background: "rgba(34, 197, 94, 0.14)", color: "#86efac", borderColor: "rgba(34, 197, 94, 0.32)" };
  }
  if (status === "paused") {
    return { background: "rgba(245, 158, 11, 0.14)", color: "#fcd34d", borderColor: "rgba(245, 158, 11, 0.32)" };
  }
  if (status === "stopped") {
    return { background: "rgba(248, 113, 113, 0.14)", color: "#fca5a5", borderColor: "rgba(248, 113, 113, 0.32)" };
  }
  return { background: "rgba(148, 163, 184, 0.12)", color: "#cbd5e1", borderColor: "rgba(148, 163, 184, 0.28)" };
}

function stepStatusStyle(status: AgentActivityStep["status"]) {
  if (status === "complete") {
    return { color: "#86efac", borderColor: "rgba(34, 197, 94, 0.28)" };
  }
  if (status === "blocked") {
    return { color: "#fcd34d", borderColor: "rgba(245, 158, 11, 0.28)" };
  }
  if (status === "running") {
    return { color: "#93c5fd", borderColor: "rgba(96, 165, 250, 0.28)" };
  }
  return { color: "#cbd5e1", borderColor: "rgba(148, 163, 184, 0.28)" };
}

function normalizeAgentStatus(status: AgentStatus | "waiting-for-approval"): AgentStatus {
  return status === "waiting-for-approval" ? "paused" : status;
}

function mapUploadedFiles(files: UploadedStateFile[] | undefined): IngestedFile[] {
  if (!Array.isArray(files)) {
    return [];
  }

  return files.map((file) => ({
    id: file.id,
    name: file.fileName ?? file.name ?? "Uploaded file",
    extension: isKnownExtension(file.extension) ? file.extension : "txt",
    mimeType: file.mimeType ?? "application/octet-stream",
    size: file.sizeBytes ?? file.size ?? 0,
    kind: file.extension === "png" || file.extension === "jpg" || file.extension === "jpeg" ? "image" : file.extension === "pdf" ? "pdf" : "text",
    summary: file.extractedSummary ?? "Uploaded file metadata from shared app state.",
    warnings: [],
    createdAt: file.uploadedAt ?? new Date().toISOString(),
  }));
}

function isKnownExtension(extension: string): extension is IngestedFile["extension"] {
  return SUPPORTED_UPLOAD_EXTENSIONS.includes(extension as IngestedFile["extension"]);
}

function findLatestAgentMessage(messages: Array<{ contentMarkdown?: string; content?: string }> | undefined) {
  if (!messages) {
    return undefined;
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.contentMarkdown || message?.content) {
      return message;
    }
  }

  return undefined;
}

const styles: Record<string, CSSProperties> = {
  panel: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    minHeight: 0,
    color: "#e5eefb",
  },
  highlighted: {
    boxShadow: "0 0 0 2px rgba(96, 165, 250, 0.72), 0 0 34px rgba(96, 165, 250, 0.24)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 14,
    alignItems: "flex-start",
  },
  headerTitle: {
    display: "flex",
    gap: 10,
    alignItems: "center",
  },
  agentIcon: {
    width: 34,
    height: 34,
    display: "grid",
    placeItems: "center",
    borderRadius: 8,
    background: "#172554",
    color: "#93c5fd",
    border: "1px solid rgba(147, 197, 253, 0.25)",
  },
  title: {
    margin: 0,
    fontSize: 15,
    lineHeight: 1.2,
  },
  subtitle: {
    margin: "3px 0 0",
    color: "#8d9ab0",
    fontSize: 12,
  },
  statusPill: {
    border: "1px solid",
    borderRadius: 999,
    padding: "5px 9px",
    fontSize: 12,
    fontWeight: 700,
  },
  unavailablePill: {
    background: "rgba(245, 158, 11, 0.14)",
    color: "#fcd34d",
    borderColor: "rgba(245, 158, 11, 0.32)",
  },
  unavailableBanner: {
    display: "grid",
    gridTemplateColumns: "20px 1fr",
    gap: 10,
    alignItems: "start",
    border: "1px solid rgba(245, 158, 11, 0.28)",
    background: "rgba(120, 83, 20, 0.2)",
    borderRadius: 8,
    padding: 11,
    color: "#fde68a",
  },
  modeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 8,
  },
  modeButton: {
    border: "1px solid rgba(148, 163, 184, 0.18)",
    background: "rgba(15, 23, 42, 0.72)",
    color: "#b9c5d6",
    borderRadius: 8,
    padding: "8px 9px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  modeButtonActive: {
    background: "rgba(37, 99, 235, 0.2)",
    color: "#dbeafe",
    borderColor: "rgba(96, 165, 250, 0.45)",
  },
  controlRow: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 8,
  },
  iconButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    border: "1px solid rgba(148, 163, 184, 0.18)",
    background: "#111827",
    color: "#dbe4f0",
    borderRadius: 8,
    padding: "8px 7px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  iconButtonDanger: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    border: "1px solid rgba(248, 113, 113, 0.28)",
    background: "rgba(127, 29, 29, 0.24)",
    color: "#fecaca",
    borderRadius: 8,
    padding: "8px 7px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  sectionLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    color: "#dce8f8",
    fontSize: 12,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0,
  },
  muted: {
    color: "#7e8ca3",
    fontSize: 12,
  },
  permissionList: {
    display: "grid",
    gap: 8,
  },
  permissionItem: {
    display: "grid",
    gridTemplateColumns: "10px 1fr",
    gap: 10,
    padding: 10,
    borderRadius: 8,
    background: "rgba(15, 23, 42, 0.54)",
    border: "1px solid rgba(148, 163, 184, 0.12)",
  },
  permissionDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    marginTop: 4,
  },
  permissionTitle: {
    fontSize: 12,
    fontWeight: 800,
    color: "#f8fafc",
  },
  permissionDescription: {
    marginTop: 3,
    color: "#8d9ab0",
    fontSize: 12,
    lineHeight: 1.35,
  },
  activityList: {
    display: "grid",
    gap: 8,
  },
  activityItem: {
    display: "grid",
    gridTemplateColumns: "22px 1fr",
    gap: 8,
  },
  activityRail: {
    width: 22,
    height: 22,
    display: "grid",
    placeItems: "center",
    color: "#93c5fd",
  },
  activityTitle: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: 800,
  },
  activityDetail: {
    margin: "4px 0",
    color: "#99a6ba",
    fontSize: 12,
    lineHeight: 1.38,
  },
  stepStatus: {
    border: "1px solid",
    borderRadius: 999,
    padding: "1px 6px",
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0,
  },
  promptBox: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    gap: 8,
    alignItems: "stretch",
  },
  textarea: {
    width: "100%",
    resize: "vertical",
    minHeight: 62,
    border: "1px solid rgba(148, 163, 184, 0.18)",
    borderRadius: 8,
    background: "#0a1221",
    color: "#e5eefb",
    padding: 10,
    font: "inherit",
    fontSize: 12,
    boxSizing: "border-box",
  },
  askButton: {
    minWidth: 94,
    border: "1px solid rgba(96, 165, 250, 0.38)",
    borderRadius: 8,
    background: "#1d4ed8",
    color: "#eff6ff",
    fontWeight: 800,
    fontSize: 12,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    cursor: "pointer",
  },
  disabledButton: {
    background: "#1f2937",
    color: "#778293",
    borderColor: "rgba(148, 163, 184, 0.12)",
    cursor: "not-allowed",
  },
  messageCard: {
    border: "1px solid rgba(148, 163, 184, 0.14)",
    borderRadius: 8,
    background: "#0b1220",
    padding: 12,
  },
  richText: {
    color: "#dbe4f0",
    fontSize: 12,
    lineHeight: 1.5,
  },
  richHeading: {
    margin: "0 0 6px",
    color: "#f8fafc",
    fontSize: 15,
  },
  richSubheading: {
    margin: "8px 0 4px",
    color: "#dbeafe",
    fontSize: 13,
  },
  paragraph: {
    margin: "0 0 6px",
  },
  bullet: {
    display: "grid",
    gridTemplateColumns: "14px 1fr",
    gap: 4,
    margin: "4px 0",
  },
  quote: {
    margin: "8px 0 0",
    padding: "8px 10px",
    borderLeft: "3px solid #60a5fa",
    background: "rgba(37, 99, 235, 0.12)",
    borderRadius: 6,
  },
  divider: {
    height: 1,
    background: "rgba(148, 163, 184, 0.16)",
    margin: "8px 0",
  },
  spacer: {
    height: 4,
  },
  inlineCode: {
    background: "rgba(15, 23, 42, 0.95)",
    border: "1px solid rgba(148, 163, 184, 0.18)",
    padding: "1px 4px",
    borderRadius: 5,
    color: "#bfdbfe",
  },
  link: {
    color: "#60a5fa",
    fontWeight: 800,
    textDecoration: "none",
  },
  uploadHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  uploadButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    border: "1px solid rgba(148, 163, 184, 0.18)",
    background: "#111827",
    color: "#dbe4f0",
    borderRadius: 8,
    padding: "7px 9px",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
  },
  fileInput: {
    display: "none",
  },
  error: {
    border: "1px solid rgba(248, 113, 113, 0.28)",
    background: "rgba(127, 29, 29, 0.2)",
    color: "#fecaca",
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
  },
  fileList: {
    display: "grid",
    gap: 8,
  },
  fileItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    border: "1px solid rgba(148, 163, 184, 0.12)",
    background: "rgba(15, 23, 42, 0.5)",
    borderRadius: 8,
    padding: 10,
  },
  fileName: {
    color: "#f8fafc",
    fontSize: 12,
    fontWeight: 800,
    wordBreak: "break-word",
  },
  fileBadge: {
    color: "#bfdbfe",
    fontSize: 11,
    fontWeight: 800,
    border: "1px solid rgba(96, 165, 250, 0.26)",
    borderRadius: 999,
    padding: "3px 7px",
  },
  emptyFiles: {
    border: "1px dashed rgba(148, 163, 184, 0.2)",
    borderRadius: 8,
    padding: 12,
    color: "#8d9ab0",
    fontSize: 12,
  },
  footer: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    color: "#7e8ca3",
    fontSize: 11,
    lineHeight: 1.35,
  },
};

export default AIAgentPanel;
