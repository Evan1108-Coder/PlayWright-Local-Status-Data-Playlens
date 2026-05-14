import { initialAppState } from "../data/mockData";
import type {
  AppState,
  AuditLogRecord,
  EntityId,
  ProjectScope,
  SearchResult,
  SettingId,
  SettingValue,
  TaskId
} from "../data/types";

export type AppView = "dashboard" | "settings" | "agent" | "data";

export interface RuntimeSummary {
  cpuPercent: number;
  memoryMb: number;
}

export type PlayLensState = AppState & {
  selectedTaskId: TaskId;
  system: RuntimeSummary;
  agent: AppState["aiAgent"];
};

export type UISearchResult = SearchResult & {
  targetId: string;
  view: AppView;
};

export function createInitialAppState(): PlayLensState {
  return normalizeState({
    ...structuredClone(initialAppState),
    selectedTaskId: initialAppState.tasks[0]?.id ?? "task-empty"
  } as PlayLensState);
}

export const appActions = {
  renameTask(state: PlayLensState, taskId: TaskId, name: string): PlayLensState {
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task || !name.trim()) return state;

    const next = normalizeState({
      ...state,
      tasks: state.tasks.map((item) =>
        item.id === taskId
          ? { ...item, name: name.trim(), updatedAt: now() }
          : item
      ),
      auditLog: [
        createAudit("user", "task.rename", `Renamed task "${task.name}" to "${name.trim()}".`, "task", taskId, task.name, name.trim()),
        ...state.auditLog
      ],
      lastUpdatedAt: now()
    });
    return next;
  },

  updateSetting(state: PlayLensState, settingId: SettingId, value: SettingValue): PlayLensState {
    let before: SettingValue | undefined;
    let label: string = settingId;
    const groups = state.settingsGroups.map((group) => ({
      ...group,
      items: group.items.map((item) => {
        if (item.id !== settingId) return item;
        before = item.value;
        label = item.label;
        return { ...item, value };
      })
    }));

    return normalizeState({
      ...state,
      settingsGroups: groups,
      aiAgent:
        settingId === "setting-ai-mode" && typeof value === "string"
          ? { ...state.aiAgent, mode: value as PlayLensState["aiAgent"]["mode"], updatedAt: now() }
          : state.aiAgent,
      auditLog: [
        createAudit("user", "settings.update", `Updated setting "${label}".`, "setting", settingId, before, value),
        ...state.auditLog
      ],
      lastUpdatedAt: now()
    });
  },

  clearAIChatHistory(state: PlayLensState): PlayLensState {
    return normalizeState({
      ...state,
      aiAgent: { ...state.aiAgent, messages: [], updatedAt: now() },
      auditLog: [
        createAudit("user", "ai.clearChatHistory", "Cleared AI chat history.", "ai-agent", undefined, "messages", []),
        ...state.auditLog
      ],
      lastUpdatedAt: now()
    });
  },

  addWatchedFolder(state: PlayLensState, folderPath: string, explicitName?: string): PlayLensState {
    const trimmed = folderPath.trim().replace(/\/+$/, "");
    if (!trimmed) return state;
    const name = explicitName?.trim() || trimmed.split("/").filter(Boolean).at(-1) || "Watched Folder";
    const scope: ProjectScope = {
      id: `scope-${slugify(name)}-${Date.now().toString(36)}` as ProjectScope["id"],
      name,
      rootPath: trimmed,
      configPath: `${trimmed}/.playlens/project.json`,
      status: "active",
      include: ["**/*"],
      exclude: ["node_modules/**", "dist/**", "build/**", ".git/**"],
      storageMode: "app-data",
      autoCreateTasks: true,
      recordOnlyWhenPlaywrightDetected: true,
      createdAt: now(),
      updatedAt: now(),
      detected: {
        packageJson: false,
        playwrightConfig: false,
        testFiles: 0,
        npmScripts: []
      }
    };

    return normalizeState({
      ...state,
      projectScopes: [scope, ...state.projectScopes],
      auditLog: [
        createAudit("user", "projectScope.add", `Added watched folder "${name}".`, "project-scope", scope.id),
        ...state.auditLog
      ],
      lastUpdatedAt: now()
    });
  },

  pauseAgent(state: PlayLensState): PlayLensState {
    return updateAgentStatus(state, "paused", "Paused AI agent task.");
  },

  resumeAgent(state: PlayLensState): PlayLensState {
    return updateAgentStatus(state, "running", "Resumed AI agent task.");
  },

  stopAgent(state: PlayLensState): PlayLensState {
    return updateAgentStatus(state, "stopped", "Stopped AI agent task.");
  }
};

export function searchApp(state: PlayLensState, query: string): UISearchResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const results: UISearchResult[] = [];
  const add = (result: UISearchResult, haystack: string) => {
    const text = haystack.toLowerCase();
    if (text.includes(needle)) {
      results.push({ ...result, score: scoreFor(text, needle) });
    }
  };

  for (const group of state.settingsGroups) {
    add(
      {
        id: `setting-group-${group.id}`,
        kind: "setting",
        label: group.label,
        description: group.description,
        color: "blue",
        score: 0,
        target: { page: "settings", sectionId: group.id, highlight: true, highlightMs: 10000 },
        targetId: group.id,
        view: "settings"
      },
      `${group.label} ${group.description}`
    );

    for (const item of group.items) {
      add(
        {
          id: item.id,
          kind: "setting",
          label: item.label,
          description: `${group.label} > ${item.description}`,
          color: item.dangerous ? "red" : "blue",
          score: 0,
          target: { page: "settings", sectionId: group.id, entityId: item.id, highlight: true, highlightMs: 10000 },
          targetId: item.id,
          view: "settings"
        },
        `${item.label} ${item.description} ${item.path} ${item.keywords.join(" ")}`
      );
    }
  }

  for (const task of state.tasks) {
    add(
      {
        id: task.id,
        kind: "task",
        label: task.name,
        description: `${task.status} · ${task.entryFile}`,
        color: task.status === "failed" ? "red" : task.status === "recording" ? "green" : "amber",
        score: 0,
        target: { page: "dashboard", sectionId: "tasks", entityId: task.id, highlight: true, highlightMs: 10000 },
        targetId: task.id,
        view: "dashboard"
      },
      `${task.name} ${task.originalName} ${task.command} ${task.status} ${task.tags.join(" ")}`
    );
  }

  for (const issue of state.issues) {
    add(
      {
        id: issue.id,
        kind: "issue",
        label: issue.title,
        description: `${issue.severity} · ${issue.category} · ${issue.description}`,
        color: issue.severity === "critical" ? "red" : "amber",
        score: 0,
        target: { page: "dashboard", sectionId: "issues", entityId: issue.id, highlight: true, highlightMs: 10000 },
        targetId: issue.id,
        view: "dashboard"
      },
      `${issue.title} ${issue.description} ${issue.category} ${issue.evidence.map((item) => item.value).join(" ")}`
    );
  }

  for (const event of state.events) {
    add(
      {
        id: event.id,
        kind: "event",
        label: event.title,
        description: `${event.kind} · ${event.message}`,
        color: event.severity === "error" || event.severity === "critical" ? "red" : "slate",
        score: 0,
        target: { page: "dashboard", sectionId: "timeline", entityId: event.id, highlight: true, highlightMs: 10000 },
        targetId: event.id,
        view: "dashboard"
      },
      `${event.title} ${event.message} ${event.kind} ${event.request?.url ?? ""}`
    );
  }

  for (const message of state.aiAgent.messages) {
    add(
      {
        id: message.id,
        kind: "ai-message",
        label: `AI ${message.role}`,
        description: message.contentMarkdown.replace(/\s+/g, " ").slice(0, 120),
        color: "violet",
        score: 0,
        target: { page: "ai", sectionId: "ai-chat", entityId: message.id, highlight: true, highlightMs: 10000 },
        targetId: message.id,
        view: "agent"
      },
      message.contentMarkdown
    );
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 12);
}

function updateAgentStatus(state: PlayLensState, status: PlayLensState["aiAgent"]["status"], summary: string): PlayLensState {
  return normalizeState({
    ...state,
    aiAgent: { ...state.aiAgent, status, currentTask: status === "stopped" ? undefined : state.aiAgent.currentTask, updatedAt: now() },
    auditLog: [createAudit("user", `ai.${status}`, summary, "ai-agent"), ...state.auditLog],
    lastUpdatedAt: now()
  });
}

function normalizeState(state: PlayLensState): PlayLensState {
  const latestMetric = state.systemMetrics.at(-1);
  return {
    ...state,
    selectedTaskId: state.selectedTaskId ?? state.tasks[0]?.id,
    agent: state.aiAgent,
    system: {
      cpuPercent: latestMetric?.cpuPercent ?? 0,
      memoryMb: latestMetric?.memoryMb ?? 0
    }
  };
}

export function renameTask(state: PlayLensState, taskId: TaskId, nextName: string): PlayLensState {
  return appActions.renameTask(state, taskId, nextName);
}

export function updateSetting(state: PlayLensState, settingIdOrPath: SettingId | string, value: SettingValue): PlayLensState {
  const settingId = findSettingId(state, settingIdOrPath);
  if (!settingId) {
    throw new Error(`Setting not found: ${settingIdOrPath}`);
  }

  return appActions.updateSetting(state, settingId, value);
}

export function clearAIChatHistory(state: PlayLensState): PlayLensState {
  return appActions.clearAIChatHistory(state);
}

export function addWatchedFolder(state: PlayLensState, input: string | { name: string; rootPath: string }): PlayLensState {
  return typeof input === "string"
    ? appActions.addWatchedFolder(state, input)
    : appActions.addWatchedFolder(state, input.rootPath, input.name);
}

export function pauseAITask(state: PlayLensState): PlayLensState {
  return appActions.pauseAgent(state);
}

export function resumeAITask(state: PlayLensState): PlayLensState {
  return appActions.resumeAgent(state);
}

export function stopAITask(state: PlayLensState): PlayLensState {
  return appActions.stopAgent(state);
}

export function searchPlayLens(state: PlayLensState, query: string): UISearchResult[] {
  return searchApp(state, query);
}

export function getSetting(state: PlayLensState, settingIdOrPath: SettingId | string) {
  const settingId = findSettingId(state, settingIdOrPath);
  return state.settingsGroups.flatMap((group) => group.items).find((item) => item.id === settingId);
}

export function createAuditRecord(
  actor: AuditLogRecord["actor"],
  action: string,
  summary: string,
  entityType: string,
  entityId?: EntityId
): AuditLogRecord {
  return createAudit(actor, action, summary, entityType, entityId);
}

function findSettingId(state: PlayLensState, settingIdOrPath: SettingId | string): SettingId | undefined {
  return state.settingsGroups
    .flatMap((group) => group.items)
    .find((item) => item.id === settingIdOrPath || item.path === settingIdOrPath)?.id;
}

function createAudit(
  actor: AuditLogRecord["actor"],
  action: string,
  summary: string,
  entityType: string,
  entityId?: EntityId,
  before?: unknown,
  after?: unknown
): AuditLogRecord {
  return {
    id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}` as AuditLogRecord["id"],
    timestamp: now(),
    actor,
    action,
    summary,
    entityType,
    entityId,
    before,
    after,
    approved: true
  };
}

function scoreFor(text: string, needle: string): number {
  const index = text.indexOf(needle);
  return index === 0 ? 100 : index > -1 ? Math.max(10, 80 - index) : 0;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "folder";
}

function now(): string {
  return new Date().toISOString();
}
