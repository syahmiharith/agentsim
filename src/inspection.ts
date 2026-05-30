import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Approval, Artifact, Event, Run, Task, TaskStatus } from "./types.js";

export interface RunInspectionModel {
  run: Run;
  finalPackagePath: string;
  tasks: Task[];
  artifacts: Artifact[];
  approvals: Approval[];
  events: Event[];
}

export async function loadRunInspection(outputRoot: string, runId?: string): Promise<RunInspectionModel> {
  const selectedRunId = runId ?? await findLatestRunId(outputRoot);
  if (!selectedRunId) {
    throw new Error(`No Agentsim runs found in ${outputRoot}.`);
  }
  const runRoot = join(outputRoot, selectedRunId);
  const stateRoot = join(runRoot, "state");
  return {
    run: await readJson<Run>(join(stateRoot, "run.json")),
    finalPackagePath: join(runRoot, "final-package"),
    tasks: await readJson<Task[]>(join(stateRoot, "tasks.json"), []),
    artifacts: await readJson<Artifact[]>(join(stateRoot, "artifacts.json"), []),
    approvals: await readJson<Approval[]>(join(stateRoot, "approvals.json"), []),
    events: await readEvents(join(stateRoot, "events.jsonl"))
  };
}

export function renderInspect(model: RunInspectionModel): string {
  const taskCounts = countByStatus(model.tasks);
  const latestEvents = model.events.slice(-5).map(formatEvent);
  return [
    `Run ID: ${model.run.id}`,
    `Goal: ${model.run.userGoal}`,
    `Status: ${model.run.status}`,
    `Model mode: ${model.run.modelMode}`,
    `Final package path: ${model.finalPackagePath}`,
    `Tasks: ${Object.entries(taskCounts).map(([status, count]) => `${status}=${count}`).join(", ") || "none"}`,
    `Artifact count: ${model.artifacts.length}`,
    `Approval count: ${model.approvals.length}`,
    "Latest events:",
    ...(latestEvents.length > 0 ? latestEvents : ["none"])
  ].join("\n");
}

export function renderEvents(model: RunInspectionModel): string {
  return model.events.map(formatEvent).join("\n");
}

export function renderArtifacts(model: RunInspectionModel): string {
  return model.artifacts.map((artifact) =>
    `${artifact.type} | ${artifact.ownerAgentId} | ${artifact.status} | ${artifact.reviewStatus} | ${artifact.approvalStatus} | ${artifact.finalPackagePath}`
  ).join("\n");
}

export function renderTasks(model: RunInspectionModel): string {
  return model.tasks.map((task) =>
    `${task.id} | ${task.status} | ${task.assignedAgentId} | ${task.dependsOn.join(",") || "-"} | ${task.outputArtifactType ?? "-"} | ${task.attempts}`
  ).join("\n");
}

export function renderApprovals(model: RunInspectionModel): string {
  return model.approvals.map((approval) =>
    `${approval.id} | ${approval.status} | ${approval.riskLevel ?? "low"} | ${approval.action ?? approval.artifactId ?? "-"} | ${approval.taskId ?? "-"}`
  ).join("\n");
}

function countByStatus(tasks: Task[]): Partial<Record<TaskStatus, number>> {
  return tasks.reduce<Partial<Record<TaskStatus, number>>>((counts, task) => {
    counts[task.status] = (counts[task.status] ?? 0) + 1;
    return counts;
  }, {});
}

function formatEvent(event: Event): string {
  return `${event.timestamp} | ${event.level} | ${event.name} | ${event.agentId ?? event.taskId ?? "system"} | ${event.message}`;
}

async function findLatestRunId(outputRoot: string): Promise<string | undefined> {
  if (!existsSync(outputRoot)) {
    return undefined;
  }

  const entries = await readdir(outputRoot, { withFileTypes: true });
  const candidates = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const runRoot = join(outputRoot, entry.name);
      const statePath = join(runRoot, "state", "run.json");
      if (!existsSync(statePath)) {
        return undefined;
      }
      const info = await stat(statePath);
      return { runId: entry.name, mtimeMs: info.mtimeMs };
    }));

  return candidates
    .filter((candidate): candidate is { runId: string; mtimeMs: number } => Boolean(candidate))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0]?.runId;
}

async function readJson<T>(path: string, fallback?: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if (fallback !== undefined) {
      return fallback;
    }
    throw error;
  }
}

async function readEvents(path: string): Promise<Event[]> {
  try {
    const content = await readFile(path, "utf8");
    return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Event);
  } catch {
    return [];
  }
}
