import { Circle, Pencil } from "lucide-react";
import type { Task, TaskId } from "../data/types";

interface TaskRailProps {
  tasks: Task[];
  totalTaskCount: number;
  hiddenTaskCount: number;
  selectedTaskId: TaskId;
  highlightTargetId: string | null;
  onSelectTask: (taskId: TaskId) => void;
  onRenameTask: (taskId: TaskId, name: string) => void;
}

function statusColor(status: Task["status"]): string {
  switch (status) {
    case "failed": return "var(--accent-red)";
    case "recording": return "var(--accent-green)";
    case "passed": return "var(--accent-green)";
    default: return "var(--text-muted)";
  }
}

export function TaskRail({ tasks, totalTaskCount, hiddenTaskCount, selectedTaskId, highlightTargetId, onSelectTask, onRenameTask }: TaskRailProps) {
  const liveCount = tasks.filter((task) => task.status === "recording").length;
  return (
    <aside className="task-rail" aria-label="Tasks">
      <div className="panel-header">
        <div>
          <h2>{totalTaskCount} Tasks</h2>
          <p>{liveCount ? `${liveCount} live, ${hiddenTaskCount} older hidden` : hiddenTaskCount ? `Showing recent history, ${hiddenTaskCount} older hidden` : "Showing current sessions"}</p>
        </div>
      </div>
      <div className="task-list">
        {tasks.map((task) => (
          <article
            key={task.id}
            className={`task-card ${task.id === selectedTaskId ? "selected" : ""} ${
              highlightTargetId === task.id ? "highlight-target" : ""
            }`}
          >
            <button onClick={() => onSelectTask(task.id)}>
              <strong>{task.name}</strong>
              <span style={{ color: statusColor(task.status), display: "flex", alignItems: "center", gap: 3 }}>
                <Circle size={6} fill={statusColor(task.status)} stroke="none" />
                {task.status}
              </span>
              <small>{task.command || task.entryFile || (task.status === "recording" ? "Live recording" : "Historical recording")}</small>
            </button>
            <button
              className="task-rename"
              onClick={() => {
                const name = window.prompt("Rename task", task.name);
                if (name) onRenameTask(task.id, name);
              }}
              title="Rename"
            >
              <Pencil size={10} />
            </button>
          </article>
        ))}
      </div>
    </aside>
  );
}
