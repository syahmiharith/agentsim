import type { Run, RunStatus, Task, TaskStatus } from "../types.js";

const taskTransitions: Record<TaskStatus, TaskStatus[]> = {
  pending: ["ready", "cancelled"],
  ready: ["running", "cancelled"],
  running: ["completed", "failed", "blocked", "needs_review", "waiting_for_approval"],
  needs_review: ["running", "completed", "failed", "cancelled"],
  waiting_for_approval: ["ready", "failed", "cancelled"],
  blocked: ["ready", "failed", "cancelled"],
  failed: ["ready", "cancelled"],
  completed: [],
  cancelled: []
};

const runTransitions: Record<RunStatus, RunStatus[]> = {
  created: ["planning", "cancelled"],
  planning: ["running", "blocked", "failed", "cancelled"],
  running: ["reviewing", "blocked", "waiting_for_approval", "completed", "failed", "cancelled"],
  reviewing: ["running", "completed", "failed", "cancelled"],
  waiting_for_approval: ["running", "failed", "cancelled"],
  blocked: ["running", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: []
};

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return taskTransitions[from].includes(to);
}

export function transitionTask(task: Task, to: TaskStatus, metadata: { failureReason?: string } = {}): Task {
  if (!canTransitionTask(task.status, to)) {
    throw new Error(`Invalid task transition: ${task.status} -> ${to}`);
  }

  const now = new Date().toISOString();
  return {
    ...task,
    status: to,
    updatedAt: now,
    completedAt: to === "completed" || to === "failed" || to === "cancelled" ? now : task.completedAt,
    failureReason: metadata.failureReason ?? (to === "failed" ? task.failureReason : undefined)
  };
}

export function canTransitionRun(from: RunStatus, to: RunStatus): boolean {
  return runTransitions[from].includes(to);
}

export function transitionRun(run: Run, to: RunStatus, metadata: { failureReason?: string } = {}): Run {
  if (!canTransitionRun(run.status, to)) {
    throw new Error(`Invalid run transition: ${run.status} -> ${to}`);
  }

  const now = new Date().toISOString();
  return {
    ...run,
    status: to,
    updatedAt: now,
    completedAt: to === "completed" || to === "failed" || to === "cancelled" ? now : run.completedAt,
    failureReason: metadata.failureReason ?? (to === "failed" ? run.failureReason : undefined)
  };
}
