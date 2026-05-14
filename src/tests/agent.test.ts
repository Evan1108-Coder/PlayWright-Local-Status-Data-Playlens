import assert from "node:assert/strict";
import { createInitialAppState, getSetting, searchApp, type PlayLensState } from "../state/appState";
import { createAgentPlan, runAgentToolCalls } from "../agent/agentRuntime";
import type { AgentToolCall } from "../agent/toolRegistry";

function withMode(state: PlayLensState, mode: PlayLensState["aiAgent"]["mode"]): PlayLensState {
  const aiAgent = { ...state.aiAgent, mode };
  return { ...state, aiAgent, agent: aiAgent };
}

let state = withMode(createInitialAppState(), "read-only");
const taskId = state.tasks[0].id;
const originalTaskName = state.tasks[0].name;

const blockedRename = runAgentToolCalls(state, [
  {
    id: "rename-blocked",
    name: "task.rename",
    args: { taskId, name: "AI Should Not Rename This" },
    reason: "Read-only safety check",
  },
]);

assert.equal(blockedRename.results[0].status, "blocked", "read-only mode should block state-changing tools");
assert.equal(blockedRename.state.tasks[0].name, originalTaskName, "blocked tool should not mutate task name");
assert.equal(
  blockedRename.state.auditLog.some((record) => record.actor === "ai-agent" && record.action === "task.rename"),
  false,
  "blocked tool should not create an AI mutation audit",
);

state = withMode(createInitialAppState(), "full-operator");
const dangerousCall: AgentToolCall<"history.clearAIChat"> = {
  id: "clear-chat",
  name: "history.clearAIChat",
  args: { scope: "all-ai-history" },
  reason: "User asked to clear chat",
};

const needsConfirmation = runAgentToolCalls(state, [dangerousCall]);
assert.equal(needsConfirmation.results[0].status, "needs-confirmation", "dangerous actions should require confirmation");
assert.equal(needsConfirmation.results[0].requiresConfirmation, true, "dangerous result should carry confirmation flag");
assert.equal(state.aiAgent.messages.length > 0, true, "fixture should contain messages before clearing");
assert.equal(needsConfirmation.state.aiAgent.messages.length, state.aiAgent.messages.length, "unconfirmed dangerous action should not mutate");

const confirmedClear = runAgentToolCalls(state, [dangerousCall], {
  confirmedToolCallIds: ["clear-chat"],
});
assert.equal(confirmedClear.results[0].status, "executed", "confirmed dangerous action should execute");
assert.equal(confirmedClear.state.aiAgent.messages.length, 0, "confirmed clear should empty AI chat history");
assert.equal(confirmedClear.auditRecords[0].approved, true, "executed dangerous action should emit approved audit");
assert.equal(confirmedClear.auditRecords[0].actor, "ai-agent", "runtime audit actor should be AI agent");

state = withMode(createInitialAppState(), "trusted-actions");
const trustedRename = runAgentToolCalls(state, [
  {
    id: "trusted-rename",
    name: "task.rename",
    args: { taskId, name: "AI Named Payment Investigation" },
    reason: "Make task list clearer",
  },
]);

assert.equal(trustedRename.results[0].status, "executed", "trusted mode should execute trusted rename");
assert.equal(trustedRename.state.tasks[0].name, "AI Named Payment Investigation", "trusted rename should update task registry");
assert.equal(
  searchApp(trustedRename.state, "AI Named Payment Investigation")[0]?.targetId,
  taskId,
  "trusted rename should sync with search",
);

state = withMode(createInitialAppState(), "full-operator");
const settingPlan = createAgentPlan(state, [
  {
    id: "update-timeout",
    name: "settings.update",
    args: { settingIdOrPath: "runtime.maxActionTimeoutMs", value: 60000 },
    reason: "Longer local debug runs need more time",
  },
]);

assert.equal(settingPlan.steps[0].status, "planned", "full operator setting update should plan without confirmation");
const settingUpdate = runAgentToolCalls(state, settingPlan.steps.map((step) => step.call));
assert.equal(settingUpdate.results[0].status, "executed", "settings update should execute");
assert.equal(
  getSetting(settingUpdate.state, "runtime.maxActionTimeoutMs")?.value,
  60000,
  "settings update should sync central settings value",
);
assert.equal(
  settingUpdate.auditRecords[0].action,
  "settings.update",
  "settings update should produce AI audit output",
);

console.log("PlayLens agent runtime tests passed.");
