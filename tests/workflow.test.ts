import { mkdtemp, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { MockModelProvider } from "../src/providers/mock-model-provider.js";
import type { ModelProvider, ModelRequest, ModelResponse } from "../src/types.js";
import { runDemo } from "../src/workflow.js";

describe("demo workflow", () => {
  it("creates the required final package in mock mode", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "agentsim-test-"));
    const result = await runDemo({
      goal: "Build an inventory request system for a flower company",
      outputRoot,
      runId: "test-run",
      modelProvider: new MockModelProvider()
    });

    expect(result.taskRun.status).toBe("COMPLETED");
    expect(result.artifacts.length).toBeGreaterThanOrEqual(15);

    const required = [
      "client/proposal.md",
      "client/project-summary.md",
      "client/handoff-notes.md",
      "client/user-guide.md",
      "planning/requirements.md",
      "planning/scope.md",
      "planning/assumptions.md",
      "planning/timeline.md",
      "planning/risks.md",
      "planning/task-breakdown.md",
      "technical/architecture.md",
      "technical/database-schema.md",
      "technical/api-plan.md",
      "app/package.json",
      "app/src/App.tsx",
      "app/server.js",
      "app/README.md",
      "review/qa-report.md",
      "review/code-review.md",
      "review/known-issues.md",
      "trace/events.jsonl",
      "trace/agent-messages.json",
      "trace/agent-actions.json",
      "trace/context-packages.json",
      "trace/context-eval.json",
      "trace/approvals.json",
      "trace/decisions.json",
      "trace/domain-spec.json",
      "trace/domain-inference.json",
      "trace/workflow-graph.json",
      "trace/tool-registry.json",
      "trace/artifact-lineage.json",
      "trace/run-summary.json"
    ];

    for (const relativePath of required) {
      await expect(stat(join(result.finalPackageDir, relativePath))).resolves.toBeTruthy();
    }

    const lineage = JSON.parse(await readFile(join(result.finalPackageDir, "trace", "artifact-lineage.json"), "utf8"));
    expect(lineage.artifacts.every((artifact: { contentHash?: string }) => Boolean(artifact.contentHash))).toBe(true);
    expect(lineage.artifacts.find((artifact: { type: string }) => artifact.type === "app").reviewStatus).toBe("passed");
    expect(lineage.artifacts.every((artifact: { approvalStatus: string; reviewStatus: string }) => artifact.approvalStatus !== "approved" || artifact.reviewStatus !== "pending")).toBe(true);

    const events = await readFile(join(result.finalPackageDir, "trace", "events.jsonl"), "utf8");
    expect(events).toContain("run.completed");
    expect(events).toContain("agent.message.sent");
    expect(events).toContain("agent.action.started");
    expect(events).toContain("agent.action.completed");
    expect(events).toContain("tool.called");
    expect(events).toContain("write_file");

    const agentActions = JSON.parse(await readFile(join(result.finalPackageDir, "trace", "agent-actions.json"), "utf8"));
    expect(agentActions.actions).toHaveLength(result.artifacts.length);
    expect(agentActions.actions.every((action: { status: string; outputArtifactId?: string; contextPackageId?: string; contextHash?: string }) =>
      action.status === "completed" && Boolean(action.outputArtifactId) && Boolean(action.contextPackageId) && Boolean(action.contextHash)
    )).toBe(true);

    const contextPackages = JSON.parse(await readFile(join(result.finalPackageDir, "trace", "context-packages.json"), "utf8"));
    expect(contextPackages.contextPackages).toHaveLength(agentActions.actions.length);
    const contextEval = JSON.parse(await readFile(join(result.finalPackageDir, "trace", "context-eval.json"), "utf8"));
    expect(contextEval.evaluation.requiredCoverageOk).toBe(true);
    expect(contextEval.evaluation.provenanceOk).toBe(true);

    const agentMessages = JSON.parse(await readFile(join(result.finalPackageDir, "trace", "agent-messages.json"), "utf8"));
    expect(agentMessages.messages.length).toBeGreaterThan(result.artifacts.length);
    expect(agentActions.actions.every((action: { inputMessageIds: string[] }) => action.inputMessageIds.length > 0)).toBe(true);
    expect(agentMessages.messages.some((message: { type: string }) => message.type === "artifact.handoff")).toBe(true);
    expect(agentMessages.messages.some((message: { type: string }) => message.type === "review.request")).toBe(true);

    const appReadme = await readFile(join(result.finalPackageDir, "app", "README.md"), "utf8");
    expect(appReadme).toContain("pnpm dev:api");
    expect(appReadme).toContain("pnpm dev:web");

    const domainSpec = JSON.parse(await readFile(join(result.finalPackageDir, "trace", "domain-spec.json"), "utf8"));
    expect(domainSpec.appName).toBe("Inventory Request Desk");

    const runSummary = JSON.parse(await readFile(join(result.finalPackageDir, "trace", "run-summary.json"), "utf8"));
    expect(runSummary.status).toBe("COMPLETED");
    expect(runSummary.validationResult.ok).toBe(true);
    expect(runSummary.artifactCount).toBe(result.artifacts.length);

    const stateRun = JSON.parse(await readFile(join(outputRoot, "test-run", "state", "run.json"), "utf8"));
    const stateTasks = JSON.parse(await readFile(join(outputRoot, "test-run", "state", "tasks.json"), "utf8"));
    const stateArtifacts = JSON.parse(await readFile(join(outputRoot, "test-run", "state", "artifacts.json"), "utf8"));
    const stateContextPackages = JSON.parse(await readFile(join(outputRoot, "test-run", "state", "context-packages.json"), "utf8"));
    const stateEvents = await readFile(join(outputRoot, "test-run", "state", "events.jsonl"), "utf8");
    const stateDomainSpec = JSON.parse(await readFile(join(outputRoot, "test-run", "state", "domain-spec.json"), "utf8"));
    const stateDomainInference = JSON.parse(await readFile(join(outputRoot, "test-run", "state", "domain-inference.json"), "utf8"));
    const traceDomainInference = JSON.parse(await readFile(join(result.finalPackageDir, "trace", "domain-inference.json"), "utf8"));
    const workflowGraph = JSON.parse(await readFile(join(result.finalPackageDir, "trace", "workflow-graph.json"), "utf8"));
    const toolRegistry = JSON.parse(await readFile(join(result.finalPackageDir, "trace", "tool-registry.json"), "utf8"));
    expect(stateRun.status).toBe("completed");
    expect(stateDomainSpec.appName).toBe("Inventory Request Desk");
    expect(stateDomainInference).toMatchObject({ matchedPresetId: "inventory-request", fallbackUsed: false, needsClarification: false });
    expect(traceDomainInference).toMatchObject({ matchedPresetId: "inventory-request", fallbackUsed: false, needsClarification: false });
    expect(workflowGraph.nodes.find((node: { id: string }) => node.id === "builder-app")).toMatchObject({ kind: "app_generation" });
    expect(toolRegistry.tools.some((tool: { name: string }) => tool.name === "write_file")).toBe(true);
    expect(stateTasks.every((task: { status: string; attempts: number }) => task.status === "completed" && task.attempts === 1)).toBe(true);
    expect(stateArtifacts).toHaveLength(result.artifacts.length);
    expect(stateContextPackages).toHaveLength(agentActions.actions.length);
    expect(stateEvents).toContain("task.started");
    expect(stateEvents).toContain("task.completed");
  });

  it("creates prompt-specific docs and app files for a barber booking prompt", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "agentsim-barber-test-"));
    const result = await runDemo({
      goal: "Build a booking system for a barber shop",
      outputRoot,
      runId: "barber-run",
      modelProvider: new MockModelProvider()
    });

    const domainSpec = JSON.parse(await readFile(join(result.finalPackageDir, "trace", "domain-spec.json"), "utf8"));
    expect(domainSpec.appName).toBe("Barber Booking Desk");
    expect(domainSpec.primaryEntity.name).toBe("Booking");
    expect(domainSpec.workflowStatuses).toContain("Confirmed");

    const requirements = await readFile(join(result.finalPackageDir, "planning", "requirements.md"), "utf8");
    expect(requirements).toContain("service");
    expect(requirements).toContain("Appointment date/time");
    expect(requirements).toContain("Confirmed");

    const app = await readFile(join(result.finalPackageDir, "app", "src", "App.tsx"), "utf8");
    expect(app).toContain("Barber Booking Desk");
    expect(app).toContain("service");
    expect(app).toContain("appointmentDateTime");
    expect(app).toContain("Confirmed");

    const packageJson = await readFile(join(result.finalPackageDir, "app", "package.json"), "utf8");
    expect(packageJson).toContain("barber-booking-desk");

    const combined = `${requirements}\n${app}\n${packageJson}`.toLowerCase();
    for (const forbidden of ["flower company", "white roses", "inventory request", "supplier"]) {
      expect(combined).not.toContain(forbidden);
    }
  });

  it.each([
    ["Build a clinic appointment system", "Clinic Appointment Desk", "Appointment", "Scheduled"],
    ["Build a restaurant reservation system", "Restaurant Reservation Desk", "Reservation", "Seated"],
    ["Build an equipment checkout system for a university club", "Club Equipment Checkout", "Checkout", "Overdue"]
  ])("creates distinct domain packages for %s", async (goal, appName, entityName, status) => {
    const outputRoot = await mkdtemp(join(tmpdir(), "agentsim-domain-test-"));
    const result = await runDemo({
      goal,
      outputRoot,
      runId: appName.toLowerCase().replace(/\s+/g, "-"),
      modelProvider: new MockModelProvider()
    });

    const domainSpec = JSON.parse(await readFile(join(result.finalPackageDir, "trace", "domain-spec.json"), "utf8"));
    expect(domainSpec.appName).toBe(appName);
    expect(domainSpec.primaryEntity.name).toBe(entityName);
    expect(domainSpec.workflowStatuses).toContain(status);

    const app = await readFile(join(result.finalPackageDir, "app", "src", "App.tsx"), "utf8");
    const readme = await readFile(join(result.finalPackageDir, "app", "README.md"), "utf8");
    expect(app).toContain(appName);
    expect(app).toContain(status);
    expect(readme).toContain(appName);
    expect(readme).toContain("pnpm dev:api");
    expect(readme).toContain("pnpm dev:web");
  });

  it("uses the live model provider for artifact-producing markdown steps", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "agentsim-live-step-test-"));
    const provider = new RecordingLiveProvider();
    const result = await runDemo({
      goal: "Build an inventory request system for a flower company",
      outputRoot,
      runId: "live-step-run",
      modelProvider: provider
    });

    expect(result.taskRun.status).toBe("COMPLETED");
    expect(provider.requests.map((request) => request.purpose)).toEqual(expect.arrayContaining([
      "run-brief",
      "agent-step:client-proposal",
      "agent-step:planning-requirements",
      "agent-step:review-qa-report",
      "agent-step:delivery-user-guide"
    ]));
    expect(provider.requests).toHaveLength(17);
    expect(provider.requests.find((request) => request.purpose === "agent-step:planning-requirements")?.prompt).toContain("Structured messages for this agent action");

    const requirements = await readFile(join(result.finalPackageDir, "planning", "requirements.md"), "utf8");
    expect(requirements).toContain("Live artifact for agent-step:planning-requirements");

    const appReadme = await readFile(join(result.finalPackageDir, "app", "README.md"), "utf8");
    expect(appReadme).toContain("pnpm dev:api");

    const agentActions = JSON.parse(await readFile(join(result.finalPackageDir, "trace", "agent-actions.json"), "utf8"));
    const modelActions = agentActions.actions.filter((action: { outputSource?: string }) => action.outputSource === "model");
    const templateActions = agentActions.actions.filter((action: { outputSource?: string }) => action.outputSource === "template");
    expect(modelActions).toHaveLength(16);
    expect(templateActions.map((action: { stepId: string }) => action.stepId)).toEqual(["builder-app"]);
  });

  it("redacts secrets from workflow state, traces, artifacts, and provider prompts", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "agentsim-secret-test-"));
    const provider = new RecordingLiveProvider();
    const secret = "sk-testsecret1234567890";
    const result = await runDemo({
      goal: `Build an inventory request system for ${secret}`,
      outputRoot,
      runId: "secret-redaction-run",
      modelProvider: provider
    });

    expect(result.taskRun.goal).not.toContain(secret);
    expect(provider.requests.some((request) => request.prompt.includes(secret) || request.system.includes(secret))).toBe(false);

    const files = await listFiles(result.finalPackageDir);
    const contents = await Promise.all(files.map((file) => readFile(file, "utf8")));
    expect(contents.join("\n")).not.toContain(secret);
    expect(contents.join("\n")).toContain("[REDACTED]");
  });

  it("redacts local paths from final-package traces while preserving state evidence", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "agentsim-trace-privacy-test-"));
    const runId = "trace-privacy-run";
    const repoRoot = process.cwd();
    const result = await runDemo({
      goal: "Build an inventory request system for a flower company",
      outputRoot,
      runId,
      repoPath: repoRoot,
      modelProvider: new MockModelProvider()
    });

    const traceFiles = await listFiles(join(result.finalPackageDir, "trace"));
    const traceContent = (await Promise.all(traceFiles.map((file) => readFile(file, "utf8")))).join("\n");
    for (const privatePath of [repoRoot, outputRoot, join(outputRoot, runId), result.finalPackageDir]) {
      for (const variant of pathVariants(privatePath)) {
        expect(traceContent).not.toContain(variant);
      }
    }
    expect(traceContent).toContain("<repo>");
    expect(traceContent).toContain("<workspace>");
    expect(traceContent).toContain("<final-package>");

    const stateRepoContext = JSON.parse(await readFile(join(outputRoot, runId, "state", "repo-context.json"), "utf8"));
    expect(stateRepoContext.rootPath).toBe(repoRoot);
  });
});

class RecordingLiveProvider implements ModelProvider {
  readonly mode = "live";
  readonly name = "recording-live";
  readonly requests: ModelRequest[] = [];

  async generate(request: ModelRequest): Promise<ModelResponse> {
    this.requests.push(request);
    return {
      content: `# Live artifact for ${request.purpose}\n\nGenerated from ${request.prompt.length} prompt characters.`,
      model: "recording-model"
    };
  }
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return files.flat();
}

function pathVariants(path: string): string[] {
  return [...new Set([
    path,
    path.replaceAll("\\", "/"),
    path.replaceAll("/", "\\")
  ])];
}
