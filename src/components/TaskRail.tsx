import type { Task, TaskId } from "../data/types";

interface TaskRailProps {
  tasks: Task[];
  selectedTaskId: TaskId;
  highlightTargetId: string | null;
  onSelectTask: (taskId: TaskId) => void;
  onRenameTask: (taskId: TaskId, name: string) => void;
}

export function TaskRail({ tasks, selectedTaskId, highlightTargetId, onSelectTask, onRenameTask }: TaskRailProps) {
  return (
    <aside className="task-rail" aria-label="Tasks">
      <div className="panel-header">
        <div>
          <span className="section-kicker">Tasks</span>
          <h2>{tasks.length} tracked</h2>
        </div>
      </div>
      <div className="task-list">
        {tasks.map((task) => (
          <article
            key={task.id}
            className={`task-card ${task.id === selectedTaskId ? "active" : ""} ${
              highlightTargetId === task.id ? "highlight-target" : ""
            }`}
          >
            <button onClick={() => onSelectTask(task.id)}>
              <strong>{task.name}</strong>
              <span>{task.status}</span>
              <small>{task.entryFile}</small>
            </button>
            <button
              className="task-rename"
              onClick={() => {
                const name = window.prompt("Rename task", task.name);
                if (name) onRenameTask(task.id, name);
              }}
            >
              Rename
            </button>
          </article>
        ))}
      </div>
    </aside>
  );
}
