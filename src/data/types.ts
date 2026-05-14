export type ISODateTime = string;
export type Milliseconds = number;
export type Bytes = number;
export type Percentage = number;

export type EntityId =
  | TaskId
  | SessionId
  | EventId
  | IssueId
  | SettingId
  | ProjectScopeId
  | AuditLogId
  | UploadedFileId
  | AIMessageId
  | AIActionId;

export type TaskId = `task-${string}`;
export type SessionId = `session-${string}`;
export type EventId = `event-${string}`;
export type IssueId = `issue-${string}`;
export type SettingId = `setting-${string}`;
export type ProjectScopeId = `scope-${string}`;
export type AuditLogId = `audit-${string}`;
export type UploadedFileId = `upload-${string}`;
export type SystemMetricId = `metric-${string}`;
export type AIMessageId = `ai-msg-${string}`;
export type AIActionId = `ai-action-${string}`;

export type TaskStatus =
  | "waiting-for-playwright"
  | "recording"
  | "passed"
  | "failed"
  | "stopped"
  | "archived";

export type SessionStatus = "pending" | "running" | "completed" | "failed" | "stopped";

export type BrowserName = "chromium" | "firefox" | "webkit" | "unknown";

export interface SourceLocation {
  filePath: string;
  line?: number;
  column?: number;
  functionName?: string;
}

export interface Task {
  id: TaskId;
  name: string;
  originalName: string;
  status: TaskStatus;
  projectScopeId: ProjectScopeId;
  sessionIds: SessionId[];
  command: string;
  entryFile: string;
  cwd: string;
  pid?: number;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  startedAt?: ISODateTime;
  endedAt?: ISODateTime;
  tags: string[];
  summary: {
    browser: BrowserName;
    currentUrl?: string;
    eventCount: number;
    issueCount: number;
    failedRequestCount: number;
    durationMs?: Milliseconds;
  };
}

export interface Session {
  id: SessionId;
  taskId: TaskId;
  status: SessionStatus;
  title: string;
  browser: {
    name: BrowserName;
    version: string;
    channel?: string;
    headless: boolean;
    viewport: {
      width: number;
      height: number;
    };
  };
  environment: {
    os: string;
    nodeVersion: string;
    playwrightVersion: string;
    gitBranch?: string;
    gitCommit?: string;
    ciProvider?: string;
  };
  startedAt: ISODateTime;
  endedAt?: ISODateTime;
  durationMs?: Milliseconds;
  currentUrl?: string;
  eventIds: EventId[];
  issueIds: IssueId[];
  metricIds: SystemMetricId[];
}

export type EventKind =
  | "task.created"
  | "playwright.detected"
  | "browser.launched"
  | "page.navigated"
  | "action.started"
  | "action.completed"
  | "assertion.failed"
  | "network.request"
  | "network.response"
  | "console.message"
  | "dom.snapshot"
  | "accessibility.snapshot"
  | "terminal.output"
  | "system.metric"
  | "issue.detected"
  | "ai.action";

export type EventSeverity = "trace" | "info" | "warning" | "error" | "critical";

export interface TimelineEvent {
  id: EventId;
  sessionId: SessionId;
  taskId: TaskId;
  kind: EventKind;
  severity: EventSeverity;
  title: string;
  message: string;
  timestamp: ISODateTime;
  durationMs?: Milliseconds;
  source?: SourceLocation;
  url?: string;
  locator?: string;
  request?: {
    method: string;
    url: string;
    status?: number;
    resourceType?: string;
    durationMs?: Milliseconds;
    sizeBytes?: Bytes;
  };
  artifactIds: string[];
  relatedIssueIds: IssueId[];
  data: Record<string, unknown>;
}

export type IssueSeverity = "low" | "medium" | "high" | "critical";
export type IssueStatus = "open" | "acknowledged" | "resolved" | "ignored";

export type IssueCategory =
  | "network"
  | "console"
  | "dom"
  | "accessibility"
  | "performance"
  | "test"
  | "system"
  | "agent";

export interface Issue {
  id: IssueId;
  taskId: TaskId;
  sessionId: SessionId;
  title: string;
  description: string;
  category: IssueCategory;
  severity: IssueSeverity;
  status: IssueStatus;
  detectedAt: ISODateTime;
  source?: SourceLocation;
  eventIds: EventId[];
  evidence: Array<{
    label: string;
    value: string;
    eventId?: EventId;
  }>;
  suggestedFixes: string[];
}

export type SettingValue = string | number | boolean | string[] | Record<string, unknown> | null;

export type SettingControl =
  | "text"
  | "number"
  | "toggle"
  | "select"
  | "multi-select"
  | "slider"
  | "button"
  | "path-picker";

export interface SettingOption {
  label: string;
  value: string | number | boolean;
}

export interface SettingItem {
  id: SettingId;
  path: string;
  label: string;
  description: string;
  value: SettingValue;
  defaultValue: SettingValue;
  control: SettingControl;
  options?: SettingOption[];
  min?: number;
  max?: number;
  unit?: string;
  keywords: string[];
  requiresRestart?: boolean;
  dangerous?: boolean;
}

export interface SettingGroup {
  id: string;
  label: string;
  description: string;
  items: SettingItem[];
}

export type StorageMode = "app-data" | "project-local";

export interface ProjectScope {
  id: ProjectScopeId;
  name: string;
  rootPath: string;
  configPath: string;
  status: "active" | "paused";
  include: string[];
  exclude: string[];
  storageMode: StorageMode;
  autoCreateTasks: boolean;
  recordOnlyWhenPlaywrightDetected: boolean;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  detected: {
    packageJson: boolean;
    playwrightConfig: boolean;
    testFiles: number;
    npmScripts: string[];
  };
}

export type AgentMode = "read-only" | "ask-before-acting" | "trusted-actions" | "full-operator";
export type AgentRunStatus = "idle" | "running" | "paused" | "stopped" | "waiting-for-approval";

export interface AIMessage {
  id: AIMessageId;
  role: "user" | "assistant" | "system" | "tool";
  contentMarkdown: string;
  createdAt: ISODateTime;
  referencedEntityIds: EntityId[];
  uploadedFileIds: UploadedFileId[];
}

export interface AIAgentAction {
  id: AIActionId;
  name: string;
  label: string;
  description: string;
  dangerous: boolean;
  enabled: boolean;
}

export interface AIAgentState {
  enabled: boolean;
  provider: "minimax" | "mock";
  model: string;
  mode: AgentMode;
  status: AgentRunStatus;
  currentTask?: string;
  messages: AIMessage[];
  allowedDataSources: string[];
  availableActions: AIAgentAction[];
  contextBudgetTokens: number;
  updatedAt: ISODateTime;
}

export type UploadedFileType = "txt" | "md" | "csv" | "json" | "html" | "pdf" | "png" | "jpg" | "jpeg";

export interface UploadedFileMetadata {
  id: UploadedFileId;
  fileName: string;
  extension: UploadedFileType;
  mimeType: string;
  sizeBytes: Bytes;
  uploadedAt: ISODateTime;
  source: "ai-chat" | "settings" | "task";
  status: "ready" | "processing" | "failed";
  extractedSummary?: string;
  tokenEstimate?: number;
}

export interface SystemMetricSample {
  id: SystemMetricId;
  taskId?: TaskId;
  sessionId?: SessionId;
  timestamp: ISODateTime;
  cpuPercent: Percentage;
  memoryMb: number;
  browserCpuPercent?: Percentage;
  browserMemoryMb?: number;
  eventLoopLagMs?: Milliseconds;
  networkRxBytes?: Bytes;
  networkTxBytes?: Bytes;
  processCount?: number;
}

export type AuditActor = "user" | "ai-agent" | "system";

export interface AuditLogRecord {
  id: AuditLogId;
  timestamp: ISODateTime;
  actor: AuditActor;
  action: string;
  summary: string;
  entityType: string;
  entityId?: EntityId;
  before?: unknown;
  after?: unknown;
  approved?: boolean;
  reason?: string;
}

export type SearchResultKind =
  | "setting"
  | "task"
  | "session"
  | "issue"
  | "event"
  | "project-scope"
  | "ai-message"
  | "uploaded-file";

export interface SearchTarget {
  page: "dashboard" | "settings" | "ai" | "data";
  sectionId: string;
  entityId?: EntityId;
  tab?: string;
  highlight: boolean;
  highlightMs: number;
}

export interface SearchResult {
  id: string;
  kind: SearchResultKind;
  label: string;
  description: string;
  color: "blue" | "green" | "amber" | "red" | "violet" | "slate";
  score: number;
  target: SearchTarget;
  targetId: string;
  view: SearchTarget["page"] | "agent";
}

export interface AppState {
  tasks: Task[];
  sessions: Session[];
  events: TimelineEvent[];
  issues: Issue[];
  settingsGroups: SettingGroup[];
  projectScopes: ProjectScope[];
  auditLog: AuditLogRecord[];
  aiAgent: AIAgentState;
  uploadedFiles: UploadedFileMetadata[];
  systemMetrics: SystemMetricSample[];
  lastUpdatedAt: ISODateTime;
}
