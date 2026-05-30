import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LocalApprovalsRepo, LocalArtifactsRepo, LocalEventsRepo, LocalRunsRepo, LocalTasksRepo } from "../src/core/repositories.js";
import { areAllTasksTerminal, getReadyTasks, hasBlockedTasks, hasFailedTasks, markReadyTasks } from "../src/core/scheduler.js";
import { canTransitionRun, canTransitionTask, transitionRun, transitionTask } from "../src/core/state-machines.js";
import { compileAgentStepsToTasks } from "../src/core/task-compiler.js";
import { ToolApprovalRequiredError, runCommandTool } from "../src/core/tools.js";
import { agentSteps } from "../src/agents/steps.js";
import type { Run, Task, ToolContext, Workspace } from "../src/types.js";

describe("state machines", () => {
  it("validates task transitions and terminal states", () => {
    const task = createTask("task-a", []);
    expect(canTransitionTask("pending", "ready")).toBe(true);
    expect(canTransitionTask("completed", "running")).toBe(false);
    expect(transitionTask(task, "ready").status).toBe("ready");
    expect(() => transitionTask({ ...task, status: "completed" }, "running")).toThrow("Invalid task transition");
  });

  it("validates run transitions and terminal states", () => {
    const run = createRun();
    expect(canTransitionRun("created", "planning")).toBe(true);
    expect(canTransitionRun("failed", "running")).toBe(false);
    expect(transitionRun(run, "planning").status).toBe("planning");
    expect(() => transitionRun({ ...run, status: "failed" }, "running")).toThrow("Invalid run transition");
  });

  it("rejects invalid transitions through repositories", async () => {
    const runRoot = await mkdtemp(join(tmpdir(), "agentsim-transition-repo-test-"));
    const runsRepo = new LocalRunsRepo(runRoot);
    const tasksRepo = new LocalTasksRepo(runRoot);
    await runsRepo.createRun({ ...createRun(), status: "completed" });
    await tasksRepo.createTask({ ...createTask("done", []), status: "completed" });

    await expect(runsRepo.updateRunStatus("running")).rejects.toThrow("Invalid run transition");
    await expect(tasksRepo.updateTaskStatus("done", "running")).rejects.toThrow("Invalid task transition");
  });

  it("allows retry and approval transitions through repositories", async () => {
    const runRoot = await mkdtemp(join(tmpdir(), "agentsim-valid-transition-repo-test-"));
    const runsRepo = new LocalRunsRepo(runRoot);
    const tasksRepo = new LocalTasksRepo(runRoot);
    await runsRepo.createRun({ ...createRun(), status: "waiting_for_approval" });
    await tasksRepo.createTask({ ...createTask("approval", []), status: "waiting_for_approval" });
    await tasksRepo.createTask({ ...createTask("retry", []), status: "failed" });

    await expect(runsRepo.updateRunStatus("running")).resolves.toMatchObject({ status: "running" });
    await expect(tasksRepo.updateTaskStatus("approval", "ready")).resolves.toMatchObject({ status: "ready" });
    await expect(tasksRepo.updateTaskStatus("retry", "ready")).resolves.toMatchObject({ status: "ready" });
  });
});

describe("scheduler", () => {
  it("marks dependency-ready tasks and blocks failed dependency chains", () => {
    const tasks = [
      createTask("a", [], "completed"),
      createTask("b", ["a"]),
      createTask("c", ["b"]),
      createTask("d", ["missing"]),
      createTask("e", [], "waiting_for_approval")
    ];

    const marked = markReadyTasks(tasks);
    expect(getReadyTasks(marked).map((task) => task.id)).toEqual(["b"]);
    expect(marked.find((task) => task.id === "b")?.status).toBe("ready");
    expect(getReadyTasks(marked.map((task) => task.id === "a" ? { ...task, status: "failed" } : task))).toEqual([]);
    expect(hasBlockedTasks(marked.map((task) => task.id === "a" ? { ...task, status: "failed" } : task))).toBe(true);
    expect(hasFailedTasks(marked.map((task) => task.id === "a" ? { ...task, status: "failed" } : task))).toBe(true);
    expect(areAllTasksTerminal([createTask("done", [], "completed"), createTask("cancel", [], "cancelled")])).toBe(true);
  });
});

describe("agent step compiler", () => {
  it("compiles deterministic dependency edges", () => {
    const tasks = compileAgentStepsToTasks("run-1", agentSteps);
    expect(tasks).toHaveLength(agentSteps.length);
    expect(tasks.find((task) => task.id === "planning-requirements")?.dependsOn.sort()).toEqual(["client-proposal", "client-summary"]);
    expect(tasks.find((task) => task.id === "builder-app")?.dependsOn.sort()).toEqual(["planning-task-breakdown", "technical-api-plan", "technical-architecture"]);
    expect(tasks.find((task) => task.id === "review-qa-report")?.dependsOn).toEqual(["builder-app"]);
  });
});

describe("local repositories", () => {
  it("persists and reloads run, task, artifact, event, message, and approval state", async () => {
    const runRoot = await mkdtemp(join(tmpdir(), "agentsim-repo-test-"));
    const run = createRun();
    const task = createTask("task-a", []);
    const runsRepo = new LocalRunsRepo(runRoot);
    const tasksRepo = new LocalTasksRepo(runRoot);
    const artifactsRepo = new LocalArtifactsRepo(runRoot);
    const eventsRepo = new LocalEventsRepo(run.id, runRoot);
    const approvalsRepo = new LocalApprovalsRepo(runRoot);

    await runsRepo.createRun(run);
    await tasksRepo.createTask(task);
    await artifactsRepo.createArtifactRecord({
      id: "artifact-a",
      type: "requirements",
      ownerAgentId: "scope-pm",
      status: "approved",
      workspacePath: join(runRoot, "workspace", "requirements.md"),
      finalPackagePath: "planning/requirements.md",
      lineage: { inputArtifactIds: [] },
      createdAt: run.createdAt,
      updatedAt: run.createdAt,
      reviewStatus: "not_required",
      approvalStatus: "approved",
      contentHash: "hash"
    });
    await eventsRepo.appendEvent({ level: "info", name: "task.started", taskId: task.id, message: "secret=shh" });
    await approvalsRepo.createApproval({
      runId: run.id,
      taskId: task.id,
      requestedBy: "tool-runtime",
      action: "run command",
      riskLevel: "high",
      notes: "needs review"
    });

    expect((await runsRepo.getRun()).id).toBe(run.id);
    expect((await tasksRepo.listTasksByRun())).toHaveLength(1);
    expect((await artifactsRepo.listArtifactsByRun())).toHaveLength(1);
    expect((await eventsRepo.listEventsByRun())[0]?.message).toContain("secret=[REDACTED]");
    expect((await approvalsRepo.listApprovalsByRun())[0]?.status).toBe("pending");
  });
});

describe("tool runtime", () => {
  it("pauses dangerous tools until approval is present", async () => {
    const context: ToolContext = {
      runId: "run",
      workspace: {
        runId: "run",
        rootDir: "root",
        workspaceDir: "root/workspace",
        finalPackageDir: "root/final-package"
      } satisfies Workspace,
      workspaceDriver: {
        async create() {
          throw new Error("unused");
        },
        async writeFile() {
          return "unused";
        },
        async readFile() {
          return "unused";
        },
        async listFiles() {
          return [];
        },
        async copyDirectory() {}
      },
      modelMode: "mock"
    };

    await expect(runCommandTool.execute({ command: "node", args: ["--version"] }, context)).rejects.toBeInstanceOf(ToolApprovalRequiredError);
  });
});

function createRun(): Run {
  return {
    id: "run-1",
    userGoal: "Build app",
    status: "created",
    modelMode: "mock",
    outputRoot: "outputs/run-1",
    createdAt: "2026-05-31T00:00:00.000Z",
    updatedAt: "2026-05-31T00:00:00.000Z"
  };
}

function createTask(id: string, dependsOn: string[], status: Task["status"] = "pending"): Task {
  return {
    id,
    runId: "run-1",
    title: id,
    description: id,
    kind: "artifact_generation",
    assignedAgentId: "scope-pm",
    status,
    dependsOn,
    requiredArtifactTypes: [],
    outputArtifactType: "requirements",
    attempts: 0,
    maxAttempts: 2,
    createdAt: "2026-05-31T00:00:00.000Z",
    updatedAt: "2026-05-31T00:00:00.000Z"
  };
}
