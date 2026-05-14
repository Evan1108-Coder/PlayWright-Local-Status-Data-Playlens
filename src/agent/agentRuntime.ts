import type { AuditLogRecord, EntityId, SettingId, TaskId } from "../data/types";
import {
  addWatchedFolder,
  clearAIChatHistory,
  pauseAITask,
  renameTask,
  resumeAITask,
  stopAITask,
  updateSetting,
  type AppView,
  type PlayLensState,
} from "../state/appState";
import {
  canAgentUseTool,
  getAgentToolDefinition,
  getSettingForAgentTool,
  isDangerousToolCall,
  type AgentToolCall,
  type AgentToolName,
} from "./toolRegistry";

export type AgentToolExecutionStatus = "planned" | "executed" | "blocked" | "needs-confirmation" | "failed";

export interface AgentRuntimeOptions {
  confirmedToolCallIds?: string[];
  actorReason?: string;
}

export interface AgentRuntimePlanStep {
  id: string;
  name: AgentToolName;
  label: string;
  summary: string;
  status: AgentToolExecutionStatus;
  requiresConfirmation: boolean;
  dangerous: boolean;
  reason: string;
  call: AgentToolCall;
}

export interface AgentRuntimePlan {
  id: string;
  mode: PlayLensState["aiAgent"]["mode"];
  steps: AgentRuntimePlanStep[];
  createdAt: string;
}

export interface AgentToolExecutionResult extends AgentRuntimePlanStep {
  audit?: AuditLogRecord;
  error?: string;
}

export interface AgentRuntimeResult {
  state: PlayLensState;
  plan: AgentRuntimePlan;
  results: AgentToolExecutionResult[];
  auditRecords: AuditLogRecord[];
}

export function createAgentPlan(
  state: PlayLensState,
  calls: AgentToolCall[],
  options: AgentRuntimeOptions = {},
): AgentRuntimePlan {
  const confirmed = new Set(options.confirmedToolCallIds ?? []);
  const steps = calls.map((call, index): AgentRuntimePlanStep => {
    const id = call.id ?? createToolCallId(call.name, index);
    const decision = canAgentUseTool(state, state.aiAgent.mode, call, confirmed.has(id));
    const definition = getAgentToolDefinition(call.name);

    return {
      id,
      name: call.name,
      label: definition.label,
      summary: summarizeToolCall(state, call),
      status: decision.allowed ? "planned" : decision.requiresConfirmation ? "needs-confirmation" : "blocked",
      requiresConfirmation: decision.requiresConfirmation,
      dangerous: isDangerousToolCall(state, call),
      reason: decision.reason,
      call: { ...call, id },
    };
  });

  return {
    id: `agent-plan-${Date.now().toString(36)}`,
    mode: state.aiAgent.mode,
    steps,
    createdAt: now(),
  };
}

export function executeAgentPlan(
  state: PlayLensState,
  plan: AgentRuntimePlan,
  options: AgentRuntimeOptions = {},
): AgentRuntimeResult {
  let nextState = state;
  const auditRecords: AuditLogRecord[] = [];
  const results: AgentToolExecutionResult[] = [];
  const confirmed = new Set(options.confirmedToolCallIds ?? []);

  for (const step of plan.steps) {
    const decision = canAgentUseTool(nextState, nextState.aiAgent.mode, step.call, confirmed.has(step.id));

    if (!decision.allowed) {
      const status: AgentToolExecutionStatus = decision.requiresConfirmation ? "needs-confirmation" : "blocked";
      results.push({
        ...step,
        status,
        requiresConfirmation: decision.requiresConfirmation,
        reason: decision.reason,
      });
      continue;
    }

    try {
      const before = snapshotBefore(nextState, step.call);
      nextState = applyAgentToolCall(nextState, step.call);
      const after = snapshotAfter(nextState, step.call);
      const audit = createAgentAudit(step, before, after, true, options.actorReason ?? step.call.reason);
      nextState = withAudit(nextState, audit);
      auditRecords.push(audit);
      results.push({
        ...step,
        status: "executed",
        requiresConfirmation: false,
        reason: decision.reason,
        audit,
      });
    } catch (error) {
      results.push({
        ...step,
        status: "failed",
        reason: "Tool execution failed.",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    state: nextState,
    plan,
    results,
    auditRecords,
  };
}

export function runAgentToolCalls(
  state: PlayLensState,
  calls: AgentToolCall[],
  options: AgentRuntimeOptions = {},
): AgentRuntimeResult {
  const plan = createAgentPlan(state, calls, options);
  return executeAgentPlan(state, plan, options);
}

function applyAgentToolCall(state: PlayLensState, call: AgentToolCall): PlayLensState {
  switch (call.name) {
    case "task.rename":
      return renameTask(state, call.args.taskId, call.args.name);

    case "settings.update":
      return updateSetting(state, call.args.settingIdOrPath, call.args.value);

    case "dashboard.open":
      return openDashboardTarget(state, call.args.view, call.args.taskId);

    case "projectScope.add":
      return addWatchedFolder(state, {
        rootPath: call.args.rootPath,
        name: call.args.name ?? call.args.rootPath.split("/").filter(Boolean).at(-1) ?? "Watched Folder",
      });

    case "ai.pause":
      return pauseAITask(state);

    case "ai.stop":
      return stopAITask(state);

    case "ai.resume":
      return resumeAITask(state);

    case "history.clearAIChat":
      return clearAIChatHistory(state);
  }
}

function openDashboardTarget(state: PlayLensState, _view: AppView, taskId?: TaskId): PlayLensState {
  if (!taskId) return state;
  const taskExists = state.tasks.some((task) => task.id === taskId);
  return taskExists ? { ...state, selectedTaskId: taskId } : state;
}

function summarizeToolCall(state: PlayLensState, call: AgentToolCall): string {
  switch (call.name) {
    case "task.rename": {
      const task = state.tasks.find((item) => item.id === call.args.taskId);
      return `Rename task "${task?.name ?? call.args.taskId}" to "${call.args.name}".`;
    }
    case "settings.update": {
      const setting = getSettingForAgentTool(state, call.args.settingIdOrPath);
      return `Update setting "${setting?.label ?? call.args.settingIdOrPath}" to ${formatValue(call.args.value)}.`;
    }
    case "dashboard.open":
      return `Open ${call.args.view}${call.args.sectionId ? ` > ${call.args.sectionId}` : ""}.`;
    case "projectScope.add":
      return `Add watched folder "${call.args.name ?? call.args.rootPath}".`;
    case "ai.pause":
      return "Pause the AI agent task.";
    case "ai.stop":
      return "Stop the AI agent task.";
    case "ai.resume":
      return "Resume the AI agent task.";
    case "history.clearAIChat":
      return "Clear AI chat history.";
  }
}

function snapshotBefore(state: PlayLensState, call: AgentToolCall): unknown {
  switch (call.name) {
    case "task.rename":
      return state.tasks.find((task) => task.id === call.args.taskId)?.name;
    case "settings.update":
      return getSettingForAgentTool(state, call.args.settingIdOrPath)?.value;
    case "dashboard.open":
      return { selectedTaskId: state.selectedTaskId };
    case "projectScope.add":
      return { projectScopeCount: state.projectScopes.length };
    case "ai.pause":
    case "ai.stop":
    case "ai.resume":
      return state.aiAgent.status;
    case "history.clearAIChat":
      return { messageCount: state.aiAgent.messages.length };
  }
}

function snapshotAfter(state: PlayLensState, call: AgentToolCall): unknown {
  switch (call.name) {
    case "task.rename":
      return state.tasks.find((task) => task.id === call.args.taskId)?.name;
    case "settings.update":
      return getSettingForAgentTool(state, call.args.settingIdOrPath)?.value;
    case "dashboard.open":
      return { selectedTaskId: state.selectedTaskId };
    case "projectScope.add":
      return { projectScopeCount: state.projectScopes.length, latestScopeId: state.projectScopes[0]?.id };
    case "ai.pause":
    case "ai.stop":
    case "ai.resume":
      return state.aiAgent.status;
    case "history.clearAIChat":
      return { messageCount: state.aiAgent.messages.length };
  }
}

function createAgentAudit(
  step: AgentRuntimePlanStep,
  before: unknown,
  after: unknown,
  approved: boolean,
  reason?: string,
): AuditLogRecord {
  return {
    id: `audit-ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}` as AuditLogRecord["id"],
    timestamp: now(),
    actor: "ai-agent",
    action: step.name,
    summary: step.summary,
    entityType: entityTypeForTool(step.call),
    entityId: entityIdForTool(step.call),
    before,
    after,
    approved,
    reason,
  };
}

function withAudit(state: PlayLensState, audit: AuditLogRecord): PlayLensState {
  const nextState = {
    ...state,
    auditLog: [audit, ...state.auditLog],
    lastUpdatedAt: now(),
  };

  return {
    ...nextState,
    agent: nextState.aiAgent,
  };
}

function entityTypeForTool(call: AgentToolCall): string {
  switch (call.name) {
    case "task.rename":
      return "task";
    case "settings.update":
      return "setting";
    case "dashboard.open":
      return "dashboard";
    case "projectScope.add":
      return "project-scope";
    case "ai.pause":
    case "ai.stop":
    case "ai.resume":
    case "history.clearAIChat":
      return "ai-agent";
  }
}

function entityIdForTool(call: AgentToolCall): EntityId | undefined {
  switch (call.name) {
    case "task.rename":
      return call.args.taskId;
    case "settings.update":
      return call.args.settingIdOrPath.startsWith("setting-")
        ? (call.args.settingIdOrPath as SettingId)
        : undefined;
    case "dashboard.open":
      return typeof call.args.targetId === "string" && call.args.targetId.includes("-")
        ? (call.args.targetId as EntityId)
        : call.args.taskId;
    case "projectScope.add":
    case "ai.pause":
    case "ai.stop":
    case "ai.resume":
    case "history.clearAIChat":
      return undefined;
  }
}

function createToolCallId(name: AgentToolName, index: number): string {
  return `${name}-${index}`;
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return `"${value}"`;
  return JSON.stringify(value);
}

function now(): string {
  return new Date().toISOString();
}
