import type { ExportFormat } from "../server/apiTypes";
import type { PlayLensState } from "../state/appState";
import type { Issue, TimelineEvent } from "../data/types";

export interface ExportContentResult {
  format: ExportFormat;
  contentType: string;
  extension: string;
  content: string;
}

export function createExportContent(state: PlayLensState, format: ExportFormat): ExportContentResult {
  if (format === "json") {
    return {
      format,
      contentType: "application/json; charset=utf-8",
      extension: "json",
      content: createJsonExport(state)
    };
  }

  if (format === "ndjson") {
    return {
      format,
      contentType: "application/x-ndjson; charset=utf-8",
      extension: "ndjson",
      content: createNdjsonExport(state)
    };
  }

  return {
    format,
    contentType: "text/markdown; charset=utf-8",
    extension: "md",
    content: createMarkdownExport(state)
  };
}

export function createJsonExport(state: PlayLensState): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      schemaVersion: 1,
      summary: summarizeState(state),
      state
    },
    null,
    2
  );
}

export function createNdjsonExport(state: PlayLensState): string {
  const records: Array<{ type: string; data: unknown }> = [
    { type: "export.manifest", data: { exportedAt: new Date().toISOString(), schemaVersion: 1, summary: summarizeState(state) } },
    ...state.projectScopes.map((data) => ({ type: "project-scope", data })),
    ...state.tasks.map((data) => ({ type: "task", data })),
    ...state.sessions.map((data) => ({ type: "session", data })),
    ...state.events.map((data) => ({ type: "event", data })),
    ...state.issues.map((data) => ({ type: "issue", data })),
    ...state.systemMetrics.map((data) => ({ type: "system-metric", data })),
    ...state.uploadedFiles.map((data) => ({ type: "uploaded-file", data })),
    ...state.aiAgent.messages.map((data) => ({ type: "ai-message", data })),
    ...state.auditLog.map((data) => ({ type: "audit-log", data }))
  ];

  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

export function createMarkdownExport(state: PlayLensState): string {
  const selectedTask = state.tasks.find((task) => task.id === state.selectedTaskId) ?? state.tasks[0];
  const openIssues = state.issues.filter((issue) => issue.status === "open");
  const failedEvents = state.events.filter((event) => event.severity === "error" || event.severity === "critical");

  return [
    "# PlayLens Export",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Summary",
    "",
    `- Tasks: ${state.tasks.length}`,
    `- Sessions: ${state.sessions.length}`,
    `- Events: ${state.events.length}`,
    `- Issues: ${state.issues.length}`,
    `- Open issues: ${openIssues.length}`,
    `- Selected task: ${selectedTask?.name ?? "None"}`,
    "",
    "## Tasks",
    "",
    ...state.tasks.map((task) => `- **${escapeMarkdown(task.name)}**: ${task.status}, ${task.summary.eventCount} events, ${task.summary.issueCount} issues`),
    "",
    "## High Priority Issues",
    "",
    ...formatIssues(state.issues.filter((issue) => issue.severity === "critical" || issue.severity === "high")),
    "",
    "## Error Events",
    "",
    ...formatEvents(failedEvents),
    "",
    "## AI Agent",
    "",
    `- Provider: ${state.aiAgent.provider}`,
    `- Model: ${state.aiAgent.model}`,
    `- Mode: ${state.aiAgent.mode}`,
    `- Status: ${state.aiAgent.status}`,
    `- Messages: ${state.aiAgent.messages.length}`,
    "",
    "## Project Scopes",
    "",
    ...state.projectScopes.map((scope) => `- **${escapeMarkdown(scope.name)}**: ${scope.status}, ${scope.rootPath}`)
  ].join("\n");
}

function summarizeState(state: PlayLensState) {
  return {
    taskCount: state.tasks.length,
    sessionCount: state.sessions.length,
    eventCount: state.events.length,
    issueCount: state.issues.length,
    openIssueCount: state.issues.filter((issue) => issue.status === "open").length,
    projectScopeCount: state.projectScopes.length,
    auditLogCount: state.auditLog.length,
    uploadedFileCount: state.uploadedFiles.length,
    selectedTaskId: state.selectedTaskId
  };
}

function formatIssues(issues: Issue[]): string[] {
  if (issues.length === 0) return ["No high priority issues."];

  return issues.map((issue) => [
    `### ${escapeMarkdown(issue.title)}`,
    "",
    `- Severity: ${issue.severity}`,
    `- Category: ${issue.category}`,
    `- Status: ${issue.status}`,
    `- Description: ${escapeMarkdown(issue.description)}`
  ].join("\n"));
}

function formatEvents(events: TimelineEvent[]): string[] {
  if (events.length === 0) return ["No error events."];

  return events.map((event) => `- **${escapeMarkdown(event.title)}** (${event.kind}): ${escapeMarkdown(event.message)}`);
}

function escapeMarkdown(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("*", "\\*").replaceAll("_", "\\_").replaceAll("`", "\\`");
}
