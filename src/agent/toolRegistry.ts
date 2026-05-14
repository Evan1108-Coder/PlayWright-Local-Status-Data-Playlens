import type {
  AgentMode,
  EntityId,
  SettingId,
  SettingItem,
  SettingValue,
  TaskId,
} from "../data/types";
import type { AppView, PlayLensState } from "../state/appState";

export type AgentToolName =
  | "task.rename"
  | "settings.update"
  | "dashboard.open"
  | "projectScope.add"
  | "ai.pause"
  | "ai.stop"
  | "ai.resume"
  | "history.clearAIChat";

export type AgentToolRisk = "read" | "safe" | "trusted" | "operator" | "dangerous";

export type AgentToolArgsMap = {
  "task.rename": {
    taskId: TaskId;
    name: string;
  };
  "settings.update": {
    settingIdOrPath: SettingId | string;
    value: SettingValue;
  };
  "dashboard.open": {
    view: AppView;
    taskId?: TaskId;
    sectionId?: string;
    targetId?: EntityId | string;
  };
  "projectScope.add": {
    rootPath: string;
    name?: string;
  };
  "ai.pause": Record<string, never>;
  "ai.stop": Record<string, never>;
  "ai.resume": Record<string, never>;
  "history.clearAIChat": {
    scope?: "current-chat" | "all-ai-history";
  };
};

export type AgentToolCall<TName extends AgentToolName = AgentToolName> = TName extends AgentToolName
  ? {
      id?: string;
      name: TName;
      args: AgentToolArgsMap[TName];
      reason?: string;
    }
  : never;

export interface AgentToolDefinition<TName extends AgentToolName = AgentToolName> {
  name: TName;
  label: string;
  description: string;
  risk: AgentToolRisk;
  mutatesState: boolean;
  dangerous: boolean;
  confirmationRequired: "never" | "ask-mode" | "dangerous";
}

export type AgentPermissionDecision =
  | {
      allowed: true;
      requiresConfirmation: boolean;
      reason: string;
    }
  | {
      allowed: false;
      requiresConfirmation: boolean;
      reason: string;
    };

export const agentToolRegistry: Record<AgentToolName, AgentToolDefinition> = {
  "task.rename": {
    name: "task.rename",
    label: "Rename task",
    description: "Rename a PlayLens task through the central task registry.",
    risk: "trusted",
    mutatesState: true,
    dangerous: false,
    confirmationRequired: "ask-mode",
  },
  "settings.update": {
    name: "settings.update",
    label: "Update setting",
    description: "Update a PlayLens setting through the central settings store.",
    risk: "operator",
    mutatesState: true,
    dangerous: false,
    confirmationRequired: "ask-mode",
  },
  "dashboard.open": {
    name: "dashboard.open",
    label: "Open dashboard view",
    description: "Move the UI to a view, task, section, or highlighted target.",
    risk: "safe",
    mutatesState: false,
    dangerous: false,
    confirmationRequired: "never",
  },
  "projectScope.add": {
    name: "projectScope.add",
    label: "Add project scope",
    description: "Add a watched local folder to the project scope registry.",
    risk: "operator",
    mutatesState: true,
    dangerous: false,
    confirmationRequired: "ask-mode",
  },
  "ai.pause": {
    name: "ai.pause",
    label: "Pause agent",
    description: "Pause the current AI operator task.",
    risk: "trusted",
    mutatesState: true,
    dangerous: false,
    confirmationRequired: "ask-mode",
  },
  "ai.stop": {
    name: "ai.stop",
    label: "Stop agent",
    description: "Stop the current AI operator task.",
    risk: "trusted",
    mutatesState: true,
    dangerous: false,
    confirmationRequired: "ask-mode",
  },
  "ai.resume": {
    name: "ai.resume",
    label: "Resume agent",
    description: "Resume the current AI operator task.",
    risk: "trusted",
    mutatesState: true,
    dangerous: false,
    confirmationRequired: "ask-mode",
  },
  "history.clearAIChat": {
    name: "history.clearAIChat",
    label: "Clear AI chat history",
    description: "Clear AI chat history from the current PlayLens state.",
    risk: "dangerous",
    mutatesState: true,
    dangerous: true,
    confirmationRequired: "dangerous",
  },
};

export function getAgentToolDefinition<TName extends AgentToolName>(name: TName): AgentToolDefinition<TName> {
  return agentToolRegistry[name] as AgentToolDefinition<TName>;
}

export function getSettingForAgentTool(state: PlayLensState, settingIdOrPath: SettingId | string): SettingItem | undefined {
  return state.settingsGroups
    .flatMap((group) => group.items)
    .find((item) => item.id === settingIdOrPath || item.path === settingIdOrPath);
}

export function isDangerousToolCall(state: PlayLensState, call: AgentToolCall): boolean {
  const definition = getAgentToolDefinition(call.name);
  if (definition.dangerous) return true;

  if (call.name === "settings.update") {
    const setting = getSettingForAgentTool(state, call.args.settingIdOrPath);
    return Boolean(setting?.dangerous);
  }

  return false;
}

export function canAgentUseTool(
  state: PlayLensState,
  mode: AgentMode,
  call: AgentToolCall,
  confirmed: boolean,
): AgentPermissionDecision {
  const definition = getAgentToolDefinition(call.name);
  const dangerous = isDangerousToolCall(state, call);

  if (definition.mutatesState && mode === "read-only") {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: "Agent is in read-only mode, so state-changing tools are blocked.",
    };
  }

  if (dangerous && !confirmed) {
    return {
      allowed: false,
      requiresConfirmation: true,
      reason: "Dangerous actions require explicit user confirmation.",
    };
  }

  if (mode === "ask-before-acting" && definition.mutatesState && !confirmed) {
    return {
      allowed: false,
      requiresConfirmation: true,
      reason: "Ask Before Acting mode requires confirmation before mutations.",
    };
  }

  if (mode === "trusted-actions" && definition.risk === "operator" && !confirmed) {
    return {
      allowed: false,
      requiresConfirmation: true,
      reason: "Trusted Actions mode requires confirmation for operator-level changes.",
    };
  }

  return {
    allowed: true,
    requiresConfirmation: false,
    reason: confirmed ? "Action was confirmed and allowed." : "Action is allowed by the current agent mode.",
  };
}

export function listAgentTools() {
  return Object.values(agentToolRegistry);
}
