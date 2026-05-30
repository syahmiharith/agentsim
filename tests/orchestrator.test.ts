import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resumeOrchestrator, runOrchestrator } from "../src/orchestrator.js";
import { LocalApprovalsRepo, LocalRunsRepo, LocalTasksRepo } from "../src/core/repositories.js";
import { ToolApprovalRequiredError } from "../src/core/tools.js";
import { MockModelProvider } from "../src/providers/mock-model-provider.js";
import type { AgentStep, ValidationResult } from "../src/types.js";

describe("scheduler-driven orchestrator", () => {
  it("executes ready tasks in deterministic dependency order", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "agentsim-orchestrator-happy-"));
    const executed: string[] = [];
    const result = await runOrchestrator({
      goal: "Build a small intake tool",
      outputRoot,
      runId: "happy-run",
      modelProvider: new MockModelProvider(),
      agentSteps: [
        testStep("client-proposal", "proposal", [], "client/proposal.md", executed),
        testStep("planning-requirements", "requirements", ["proposal"], "planning/requirements.md", executed),
        testStep("delivery-user-guide", "user-guide", ["requirements"], "client/user-guide.md", executed)
      ],
      validateFinalPackage: async () => okValidation()
    });

    expect(result.taskRun.status).toBe("COMPLETED");
    expect(executed).toEqual(["client-proposal", "planning-requirements", "delivery-user-guide"]);

    const tasks = JSON.parse(await readFile(join(outputRoot, "happy-run", "state", "tasks.json"), "utf8"));
    expect(tasks.map((task: { id: string; status: string; attempts: number }) => [task.id, task.status, task.attempts])).toEqual([
      ["client-proposal", "completed", 1],
      ["planning-requirements", "completed", 1],
      ["delivery-user-guide", "completed", 1]
    ]);
  });

  it("retries a failed task and fails the run after max attempts", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "agentsim-orchestrator-fail-"));
    let attempts = 0;

    await expect(runOrchestrator({
      goal: "Build a failing tool",
      outputRoot,
      runId: "failed-run",
      modelProvider: new MockModelProvider(),
      agentSteps: [{
        ...testStep("client-proposal", "proposal", [], "client/proposal.md"),
        async execute() {
          attempts += 1;
          throw new Error("intentional failure");
        }
      }],
      validateFinalPackage: async () => okValidation()
    })).rejects.toThrow("intentional failure");

    const run = JSON.parse(await readFile(join(outputRoot, "failed-run", "state", "run.json"), "utf8"));
    const tasks = JSON.parse(await readFile(join(outputRoot, "failed-run", "state", "tasks.json"), "utf8"));
    expect(attempts).toBe(2);
    expect(run.status).toBe("failed");
    expect(tasks[0]).toMatchObject({ status: "failed", attempts: 2, failureReason: "intentional failure" });
  });

  it("fails clearly when a task requires an artifact with no producer", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "agentsim-orchestrator-missing-"));

    await expect(runOrchestrator({
      goal: "Build a broken graph",
      outputRoot,
      runId: "missing-input-run",
      modelProvider: new MockModelProvider(),
      agentSteps: [
        testStep("planning-requirements", "requirements", ["proposal"], "planning/requirements.md")
      ],
      validateFinalPackage: async () => okValidation()
    })).rejects.toThrow("requires proposal, but no producer exists");

    const run = JSON.parse(await readFile(join(outputRoot, "missing-input-run", "state", "run.json"), "utf8"));
    expect(run.status).toBe("failed");
  });

  it("marks the run failed when final package validation fails", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "agentsim-orchestrator-validation-"));

    await expect(runOrchestrator({
      goal: "Build a package with validation failure",
      outputRoot,
      runId: "validation-run",
      modelProvider: new MockModelProvider(),
      agentSteps: [testStep("client-proposal", "proposal", [], "client/proposal.md")],
      validateFinalPackage: async () => ({ ok: false, failures: ["validation failed"] })
    })).rejects.toThrow("Final package validation failed: validation failed");

    const run = JSON.parse(await readFile(join(outputRoot, "validation-run", "state", "run.json"), "utf8"));
    expect(run.status).toBe("failed");
    expect(run.failureReason).toBe("VALIDATION_FAILED");
  });

  it("pauses for approval without validating or completing the run", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "agentsim-orchestrator-approval-"));
    let validationCalled = false;

    const result = await runOrchestrator({
      goal: "Build an approval-gated tool",
      outputRoot,
      runId: "approval-run",
      modelProvider: new MockModelProvider(),
      agentSteps: [{
        ...testStep("client-proposal", "proposal", [], "client/proposal.md"),
        async execute() {
          throw new ToolApprovalRequiredError("run_command", "dangerous command");
        }
      }],
      validateFinalPackage: async () => {
        validationCalled = true;
        return okValidation();
      }
    });

    const run = JSON.parse(await readFile(join(outputRoot, "approval-run", "state", "run.json"), "utf8"));
    const tasks = JSON.parse(await readFile(join(outputRoot, "approval-run", "state", "tasks.json"), "utf8"));
    const approvals = JSON.parse(await readFile(join(outputRoot, "approval-run", "state", "approvals.json"), "utf8"));

    expect(result.taskRun.status).toBe("WAITING_HUMAN_APPROVAL");
    expect(validationCalled).toBe(false);
    expect(run.status).toBe("waiting_for_approval");
    expect(tasks[0].status).toBe("waiting_for_approval");
    expect(approvals[0]).toMatchObject({ status: "pending", action: "dangerous command" });
  });

  it("approves and resumes the same paused run to completion", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "agentsim-orchestrator-resume-"));
    let shouldPause = true;
    const gatedStep: AgentStep = {
      ...testStep("client-proposal", "proposal", [], "client/proposal.md"),
      async execute(context) {
        if (shouldPause) {
          await context.tools?.askHuman({ action: "approve proposal", requestedBy: "client-intake" });
        }
        return {
          content: "# proposal\n\nApproved.",
          workspaceRelativePath: "artifacts/proposal.md",
          finalPackagePath: "client/proposal.md",
          status: "approved",
          reviewStatus: "not_required",
          approvalStatus: "approved",
          outputSource: "template"
        };
      }
    };

    const paused = await runOrchestrator({
      goal: "Build a resumable app",
      outputRoot,
      runId: "resume-run",
      modelProvider: new MockModelProvider(),
      agentSteps: [gatedStep, testStep("delivery-user-guide", "user-guide", ["proposal"], "client/user-guide.md")],
      validateFinalPackage: async () => okValidation()
    });
    expect(paused.taskRun.status).toBe("WAITING_HUMAN_APPROVAL");

    const runRoot = join(outputRoot, "resume-run");
    const approvalsRepo = new LocalApprovalsRepo(runRoot);
    const tasksRepo = new LocalTasksRepo(runRoot);
    const runsRepo = new LocalRunsRepo(runRoot);
    const approval = (await approvalsRepo.listApprovalsByRun())[0];
    await approvalsRepo.updateApprovalStatus(approval.id, "approved");
    await tasksRepo.updateTaskStatus(approval.taskId ?? "", "ready");
    await runsRepo.updateRunStatus("running");
    shouldPause = false;

    const resumed = await resumeOrchestrator({
      outputRoot,
      runId: "resume-run",
      modelProvider: new MockModelProvider(),
      agentSteps: [gatedStep, testStep("delivery-user-guide", "user-guide", ["proposal"], "client/user-guide.md")],
      validateFinalPackage: async () => okValidation()
    });

    const run = JSON.parse(await readFile(join(outputRoot, "resume-run", "state", "run.json"), "utf8"));
    const tasks = JSON.parse(await readFile(join(outputRoot, "resume-run", "state", "tasks.json"), "utf8"));
    expect(resumed.taskRun.status).toBe("COMPLETED");
    expect(run.status).toBe("completed");
    expect(tasks.every((task: { status: string }) => task.status === "completed")).toBe(true);
  });

  it("refuses resume with pending approvals or terminal runs", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "agentsim-orchestrator-resume-refuse-"));
    await runOrchestrator({
      goal: "Build an approval-gated tool",
      outputRoot,
      runId: "pending-run",
      modelProvider: new MockModelProvider(),
      agentSteps: [{
        ...testStep("client-proposal", "proposal", [], "client/proposal.md"),
        async execute() {
          throw new ToolApprovalRequiredError("ask_human", "pending approval");
        }
      }],
      validateFinalPackage: async () => okValidation()
    });

    await expect(resumeOrchestrator({
      outputRoot,
      runId: "pending-run",
      modelProvider: new MockModelProvider(),
      agentSteps: [testStep("client-proposal", "proposal", [], "client/proposal.md")],
      validateFinalPackage: async () => okValidation()
    })).rejects.toThrow("still has pending approvals");

    const completedRoot = await mkdtemp(join(tmpdir(), "agentsim-orchestrator-resume-completed-"));
    await runOrchestrator({
      goal: "Build a complete app",
      outputRoot: completedRoot,
      runId: "completed-run",
      modelProvider: new MockModelProvider(),
      agentSteps: [testStep("client-proposal", "proposal", [], "client/proposal.md")],
      validateFinalPackage: async () => okValidation()
    });
    await expect(resumeOrchestrator({
      outputRoot: completedRoot,
      runId: "completed-run",
      modelProvider: new MockModelProvider(),
      agentSteps: [testStep("client-proposal", "proposal", [], "client/proposal.md")],
      validateFinalPackage: async () => okValidation()
    })).rejects.toThrow("cannot be resumed from terminal status completed");
  });

  it("emits repair-loop events for recoverable validation failures", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "agentsim-orchestrator-repair-"));

    await expect(runOrchestrator({
      goal: "Build a repairable package",
      outputRoot,
      runId: "repair-run",
      modelProvider: new MockModelProvider(),
      agentSteps: [testStep("review-qa-report", "qa-report", [], "review/qa-report.md")],
      validateFinalPackage: async () => ({ ok: false, failures: ["Missing required final-package file: client/user-guide.md"] }),
      enableRepairLoop: true
    })).rejects.toThrow("Repair loop created a fix task");

    const tasks = JSON.parse(await readFile(join(outputRoot, "repair-run", "state", "tasks.json"), "utf8"));
    const events = await readFile(join(outputRoot, "repair-run", "state", "events.jsonl"), "utf8");
    expect(tasks.some((task: { kind: string }) => task.kind === "fix")).toBe(true);
    expect(events).toContain("review.fix_task_created");
  });
});

function testStep(
  id: string,
  outputType: AgentStep["outputType"],
  requiredInputs: AgentStep["requiredInputs"],
  finalPackagePath: string,
  executed: string[] = []
): AgentStep {
  return {
    id,
    ownerAgentId: id.startsWith("delivery") ? "delivery" : id.startsWith("planning") ? "scope-pm" : "client-intake",
    action: `produce ${outputType}`,
    outputType,
    requiredInputs,
    reviewRequired: false,
    async execute() {
      executed.push(id);
      return {
        content: `# ${outputType}\n\nGenerated by ${id}.`,
        workspaceRelativePath: `artifacts/${id}.md`,
        finalPackagePath,
        status: "approved",
        reviewStatus: "not_required",
        approvalStatus: "approved",
        outputSource: "template",
        actionSummary: `Generated ${outputType}.`
      };
    }
  };
}

function okValidation(): ValidationResult {
  return { ok: true, failures: [] };
}
