import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AgentActionRecord, AgentMessageRecord, Approval, Artifact, ContextPackage, Event, Run, RunStatus, Task, TaskStatus } from "../types.js";
import { safeJoin } from "./paths.js";
import { redactRecord, redactSecrets } from "./redact.js";
import { atomicWriteJson, readJson, withRunStateLock } from "./state-io.js";
import { transitionRun, transitionTask } from "./state-machines.js";

export class LocalRunsRepo {
  constructor(private readonly runRoot: string) {}

  async createRun(run: Run): Promise<Run> {
    await this.saveRun(run);
    return run;
  }

  async getRun(): Promise<Run> {
    return readJson<Run>(this.path("run.json"));
  }

  async saveRun(run: Run): Promise<Run> {
    await withRunStateLock(this.runRoot, async () => {
      await atomicWriteJson(this.path("run.json"), run);
    });
    return run;
  }

  async updateRunStatus(status: RunStatus, failureReason?: string): Promise<Run> {
    return withRunStateLock(this.runRoot, async () => {
      const run = await readJson<Run>(this.path("run.json"));
      const updated = run.status === status
        ? { ...run, failureReason: failureReason ?? run.failureReason, updatedAt: new Date().toISOString() }
        : transitionRun(run, status, { failureReason });
      await atomicWriteJson(this.path("run.json"), updated);
      return updated;
    });
  }

  private path(relativePath: string): string {
    return safeJoin(join(this.runRoot, "state"), relativePath);
  }
}

export class LocalTasksRepo {
  constructor(private readonly runRoot: string) {}

  async createTask(task: Task): Promise<Task> {
    return withRunStateLock(this.runRoot, async () => {
      const tasks = await readJson<Task[]>(this.path("tasks.json"), []);
      await this.writeTasks([...tasks.filter((candidate) => candidate.id !== task.id), task]);
      return task;
    });
  }

  async getTask(taskId: string): Promise<Task> {
    const task = (await this.listTasksByRun()).find((candidate) => candidate.id === taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return task;
  }

  async listTasksByRun(): Promise<Task[]> {
    return readJson<Task[]>(this.path("tasks.json"), []);
  }

  async updateTaskStatus(taskId: string, status: TaskStatus, failureReason?: string): Promise<Task> {
    return withRunStateLock(this.runRoot, async () => {
      const tasks = await readJson<Task[]>(this.path("tasks.json"), []);
      const now = new Date().toISOString();
      let updatedTask: Task | undefined;
      const updatedTasks = tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }
        updatedTask = task.status === status
          ? { ...task, failureReason: failureReason ?? task.failureReason, updatedAt: now }
          : transitionTask(task, status, { failureReason });
        return updatedTask;
      });
      if (!updatedTask) {
        throw new Error(`Task not found: ${taskId}`);
      }
      await this.writeTasks(updatedTasks);
      return updatedTask;
    });
  }

  async incrementTaskAttempt(taskId: string): Promise<Task> {
    return withRunStateLock(this.runRoot, async () => {
      const tasks = await readJson<Task[]>(this.path("tasks.json"), []);
      const now = new Date().toISOString();
      let updatedTask: Task | undefined;
      const updatedTasks = tasks.map((task) => {
        if (task.id !== taskId) {
          return task;
        }
        updatedTask = { ...task, attempts: task.attempts + 1, updatedAt: now };
        return updatedTask;
      });
      if (!updatedTask) {
        throw new Error(`Task not found: ${taskId}`);
      }
      await this.writeTasks(updatedTasks);
      return updatedTask;
    });
  }

  async saveTask(task: Task): Promise<Task> {
    return withRunStateLock(this.runRoot, async () => {
      const tasks = await readJson<Task[]>(this.path("tasks.json"), []);
      await this.writeTasks(tasks.map((candidate) => candidate.id === task.id ? task : candidate));
      return task;
    });
  }

  async saveTasks(tasks: Task[]): Promise<Task[]> {
    await withRunStateLock(this.runRoot, async () => {
      await this.writeTasks(tasks);
    });
    return tasks;
  }

  private async writeTasks(tasks: Task[]): Promise<void> {
    await atomicWriteJson(this.path("tasks.json"), tasks);
  }

  private path(relativePath: string): string {
    return safeJoin(join(this.runRoot, "state"), relativePath);
  }
}

export class LocalArtifactsRepo {
  constructor(private readonly runRoot: string) {}

  async createArtifactRecord(artifact: Artifact): Promise<Artifact> {
    return withRunStateLock(this.runRoot, async () => {
      const artifacts = await readJson<Artifact[]>(this.path("artifacts.json"), []);
      await atomicWriteJson(this.path("artifacts.json"), [...artifacts.filter((candidate) => candidate.id !== artifact.id), artifact]);
      return artifact;
    });
  }

  async listArtifactsByRun(): Promise<Artifact[]> {
    return readJson<Artifact[]>(this.path("artifacts.json"), []);
  }

  private path(relativePath: string): string {
    return safeJoin(join(this.runRoot, "state"), relativePath);
  }
}

export class LocalAgentActionsRepo {
  constructor(private readonly runRoot: string) {}

  async createAction(action: AgentActionRecord): Promise<AgentActionRecord> {
    return withRunStateLock(this.runRoot, async () => {
      const actions = await readJson<AgentActionRecord[]>(this.path("agent-actions.json"), []);
      await atomicWriteJson(this.path("agent-actions.json"), [...actions.filter((candidate) => candidate.id !== action.id), action]);
      return action;
    });
  }

  async listActionsByRun(): Promise<AgentActionRecord[]> {
    return readJson<AgentActionRecord[]>(this.path("agent-actions.json"), []);
  }

  private path(relativePath: string): string {
    return safeJoin(join(this.runRoot, "state"), relativePath);
  }
}

export class LocalContextPackagesRepo {
  constructor(private readonly runRoot: string) {}

  async createContextPackage(contextPackage: ContextPackage): Promise<ContextPackage> {
    return withRunStateLock(this.runRoot, async () => {
      const packages = await readJson<ContextPackage[]>(this.path("context-packages.json"), []);
      await atomicWriteJson(this.path("context-packages.json"), [...packages.filter((candidate) => candidate.id !== contextPackage.id), contextPackage]);
      return contextPackage;
    });
  }

  async listContextPackagesByRun(): Promise<ContextPackage[]> {
    return readJson<ContextPackage[]>(this.path("context-packages.json"), []);
  }

  private path(relativePath: string): string {
    return safeJoin(join(this.runRoot, "state"), relativePath);
  }
}

export class LocalMessagesRepo {
  constructor(private readonly runRoot: string) {}

  async createMessage(message: AgentMessageRecord): Promise<AgentMessageRecord> {
    return withRunStateLock(this.runRoot, async () => {
      const messages = await readJson<AgentMessageRecord[]>(this.path("messages.json"), []);
      await atomicWriteJson(this.path("messages.json"), [...messages.filter((candidate) => candidate.id !== message.id), message]);
      return message;
    });
  }

  async listMessagesByRun(): Promise<AgentMessageRecord[]> {
    return readJson<AgentMessageRecord[]>(this.path("messages.json"), []);
  }

  private path(relativePath: string): string {
    return safeJoin(join(this.runRoot, "state"), relativePath);
  }
}

export class LocalEventsRepo {
  constructor(
    private readonly runId: string,
    private readonly runRoot: string
  ) {}

  async appendEvent(input: Omit<Event, "id" | "timestamp" | "runId">): Promise<Event> {
    const event: Event = {
      ...input,
      id: randomUUID(),
      runId: this.runId,
      timestamp: new Date().toISOString(),
      message: redactSecrets(input.message),
      data: input.data ? redactRecord(input.data) : undefined
    };
    const path = this.path("events.jsonl");
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(event)}\n`, "utf8");
    return event;
  }

  async listEventsByRun(): Promise<Event[]> {
    try {
      const content = await readFile(this.path("events.jsonl"), "utf8");
      return content.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Event);
    } catch {
      return [];
    }
  }

  private path(relativePath: string): string {
    return safeJoin(join(this.runRoot, "state"), relativePath);
  }
}

export class LocalApprovalsRepo {
  constructor(private readonly runRoot: string) {}

  async createApproval(input: Omit<Approval, "id" | "requestedAt" | "createdAt" | "status"> & { id?: string; status?: Approval["status"] }): Promise<Approval> {
    const now = new Date().toISOString();
    const approval: Approval = {
      ...input,
      id: input.id ?? randomUUID(),
      requestedAt: now,
      createdAt: now,
      status: input.status ?? "pending",
      notes: input.notes
    };
    return withRunStateLock(this.runRoot, async () => {
      const approvals = await readJson<Approval[]>(this.path("approvals.json"), []);
      await atomicWriteJson(this.path("approvals.json"), [...approvals.filter((candidate) => candidate.id !== approval.id), approval]);
      return approval;
    });
  }

  async getApproval(approvalId: string): Promise<Approval> {
    const approval = (await this.listApprovalsByRun()).find((candidate) => candidate.id === approvalId);
    if (!approval) {
      throw new Error(`Approval not found: ${approvalId}`);
    }
    return approval;
  }

  async updateApprovalStatus(approvalId: string, status: Approval["status"], notes?: string): Promise<Approval> {
    return withRunStateLock(this.runRoot, async () => {
      const approvals = await readJson<Approval[]>(this.path("approvals.json"), []);
      const now = new Date().toISOString();
      let updatedApproval: Approval | undefined;
      const updatedApprovals = approvals.map((approval) => {
        if (approval.id !== approvalId) {
          return approval;
        }
        updatedApproval = {
          ...approval,
          status,
          notes: notes ?? approval.notes,
          resolvedAt: now,
          approver: "human"
        };
        return updatedApproval;
      });
      if (!updatedApproval) {
        throw new Error(`Approval not found: ${approvalId}`);
      }
      await atomicWriteJson(this.path("approvals.json"), updatedApprovals);
      return updatedApproval;
    });
  }

  async listApprovalsByRun(): Promise<Approval[]> {
    return readJson<Approval[]>(this.path("approvals.json"), []);
  }

  private path(relativePath: string): string {
    return safeJoin(join(this.runRoot, "state"), relativePath);
  }
}
