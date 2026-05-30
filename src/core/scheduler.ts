import type { Task } from "../types.js";

const terminalStatuses = new Set(["completed", "failed", "cancelled"]);

export function getReadyTasks(tasks: Task[]): Task[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return tasks.filter((task) => {
    if (task.status !== "ready" && task.status !== "pending") {
      return false;
    }

    return task.dependsOn.every((dependencyId) => byId.get(dependencyId)?.status === "completed");
  });
}

export function markReadyTasks(tasks: Task[]): Task[] {
  const readyIds = new Set(getReadyTasks(tasks).map((task) => task.id));
  const now = new Date().toISOString();
  return tasks.map((task) => task.status === "pending" && readyIds.has(task.id)
    ? { ...task, status: "ready", updatedAt: now }
    : task);
}

export function hasBlockedTasks(tasks: Task[]): boolean {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return tasks.some((task) =>
    task.status === "blocked" ||
    (!terminalStatuses.has(task.status) && task.dependsOn.some((dependencyId) => byId.get(dependencyId)?.status === "failed"))
  );
}

export function hasFailedTasks(tasks: Task[]): boolean {
  return tasks.some((task) => task.status === "failed");
}

export function areAllTasksTerminal(tasks: Task[]): boolean {
  return tasks.length > 0 && tasks.every((task) => terminalStatuses.has(task.status));
}
