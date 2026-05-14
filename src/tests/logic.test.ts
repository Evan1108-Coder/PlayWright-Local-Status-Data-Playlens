import assert from "node:assert/strict";
import { appActions, createInitialAppState, searchApp } from "../state/appState";

let state = createInitialAppState();

assert.equal(state.tasks.length > 0, true, "mock state should include tasks");
assert.equal(searchApp(state, "timeout").some((result) => result.view === "settings"), true, "timeout search should include settings");

const taskId = state.tasks[0].id;
state = appActions.renameTask(state, taskId, "Payment Regression Debug");
assert.equal(state.tasks[0].name, "Payment Regression Debug", "task rename should update task registry");
assert.equal(searchApp(state, "Payment Regression Debug")[0]?.targetId, taskId, "renamed task should be searchable");
assert.equal(state.auditLog[0].action, "task.rename", "task rename should create audit record");

state = appActions.updateSetting(state, "setting-runtime-action-timeout", 45000);
const runtimeGroup = state.settingsGroups.find((group) => group.id === "runtime");
const timeoutSetting = runtimeGroup?.items.find((item) => item.id === "setting-runtime-action-timeout");
assert.equal(timeoutSetting?.value, 45000, "setting update should mutate central settings model");
assert.equal(state.auditLog[0].action, "settings.update", "setting update should be audited");

state = appActions.clearAIChatHistory(state);
assert.equal(state.aiAgent.messages.length, 0, "clearing AI history should empty messages");
assert.equal(state.auditLog[0].action, "ai.clearChatHistory", "clearing AI history should be audited");

state = appActions.addWatchedFolder(state, "/Users/example/Projects/playlens-demo");
assert.equal(state.projectScopes[0].configPath.endsWith("/.playlens/project.json"), true, "watched folder should produce project config path");
assert.equal(searchApp(state, "folder").some((result) => result.view === "settings"), true, "folder search should link to settings");

state = appActions.pauseAgent(state);
assert.equal(state.aiAgent.status, "paused", "agent should pause");
state = appActions.resumeAgent(state);
assert.equal(state.aiAgent.status, "running", "agent should resume");
state = appActions.stopAgent(state);
assert.equal(state.aiAgent.status, "stopped", "agent should stop");

console.log("PlayLens logic tests passed.");
