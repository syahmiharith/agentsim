import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FileArtifactStore } from "./core/artifacts.js";
import { JsonlEventStore } from "./core/events.js";
import { LocalFilesystemWorkspaceDriver } from "./core/workspace.js";
import { inferDomainSpec } from "./domain/mock-domain-spec.js";
import { getAgent } from "./agents/agents.js";
import {
  apiPlan,
  architecture,
  assumptions,
  codeReview,
  databaseSchema,
  handoffGuide,
  knownIssues,
  projectSummary,
  proposal,
  qaReport,
  requirements,
  risks,
  scope,
  taskBreakdown,
  timeline
} from "./templates/markdown.js";
import { writeGeneratedApp } from "./templates/app.js";
import type { DomainSpec } from "./domain/domain-spec.js";
import type { Approval, Artifact, Decision, ModelProvider, TaskRun } from "./types.js";

export interface RunDemoOptions {
  goal: string;
  outputRoot?: string;
  runId?: string;
  modelProvider: ModelProvider;
}

export interface RunDemoResult {
  taskRun: TaskRun;
  finalPackageDir: string;
  artifacts: Artifact[];
  decisions: Decision[];
  domainSpec: DomainSpec;
}

export async function runDemo(options: RunDemoOptions): Promise<RunDemoResult> {
  const outputRoot = options.outputRoot ?? "outputs";
  const runId = options.runId ?? createRunId();
  const driver = new LocalFilesystemWorkspaceDriver();
  const workspace = await driver.create(runId, outputRoot);
  const eventStore = new JsonlEventStore(runId, join(workspace.finalPackageDir, "trace", "events.jsonl"));
  const artifactStore = new FileArtifactStore(workspace);
  const decisions: Decision[] = [];
  const domainSpec = inferDomainSpec(options.goal);
  const taskRun: TaskRun = {
    id: runId,
    goal: options.goal,
    startedAt: new Date().toISOString(),
    status: "running",
    modelMode: options.modelProvider.mode,
    outputDir: workspace.rootDir
  };

  await eventStore.append({
    runId,
    level: "info",
    name: "run.started",
    message: `Started Agentsim demo run ${runId}.`,
    data: {
      goal: options.goal,
      modelMode: options.modelProvider.mode,
      provider: options.modelProvider.name,
      appName: domainSpec.appName,
      domain: domainSpec.domain,
      primaryEntity: domainSpec.primaryEntity.name
    }
  });

  decisions.push({
    id: "domain-spec",
    runId,
    madeAt: new Date().toISOString(),
    madeBy: "system",
    title: "Domain inference",
    rationale: `Inferred ${domainSpec.domain} from the user goal and selected ${domainSpec.primaryEntity.name} as the primary workflow entity.`,
    selectedOption: domainSpec.appName
  });

  decisions.push({
    id: "model-provider",
    runId,
    madeAt: new Date().toISOString(),
    madeBy: "system",
    title: "Model provider selection",
    rationale: options.modelProvider.mode === "mock"
      ? "No live model key was required; deterministic mock mode keeps the demo and tests reproducible."
      : "A live OpenAI-compatible provider was configured for this run.",
    selectedOption: options.modelProvider.mode
  });

  try {
    if (options.modelProvider.mode === "live") {
      await eventStore.append({
        runId,
        level: "info",
        name: "model.run_brief.started",
        message: "Requesting live model run brief."
      });
      const runBrief = await options.modelProvider.generate({
        system: "You are the planning coordinator for Agentsim. Return concise Markdown only.",
        prompt: `Create a brief execution note for this freelance software delivery goal: ${options.goal}`,
        purpose: "run-brief"
      });
      decisions.push({
        id: "live-model-brief",
        runId,
        madeAt: new Date().toISOString(),
        madeBy: "system",
        title: "Live model run brief",
        rationale: "The live provider was exercised before deterministic package assembly.",
        selectedOption: runBrief.model
      });
      await eventStore.append({
        runId,
        level: "info",
        name: "model.run_brief.completed",
        message: "Live model run brief completed.",
        data: { model: runBrief.model, contentLength: runBrief.content.length }
      });
    }

    const proposalArtifact = await createArtifact({
      artifactStore,
      eventStore,
      goal: options.goal,
      type: "proposal",
      ownerAgentId: "client-intake",
      content: proposal(domainSpec),
      workspaceRelativePath: "artifacts/client/proposal.md",
      finalPackagePath: "client/proposal.md"
    });
    const summaryArtifact = await createArtifact({
      artifactStore,
      eventStore,
      goal: options.goal,
      type: "project-summary",
      ownerAgentId: "client-intake",
      content: projectSummary(domainSpec),
      workspaceRelativePath: "artifacts/client/project-summary.md",
      finalPackagePath: "client/project-summary.md",
      inputArtifactIds: [proposalArtifact.id]
    });

    const planningInputs = [proposalArtifact.id, summaryArtifact.id];
    const requirementsArtifact = await createArtifact({
      artifactStore,
      eventStore,
      goal: options.goal,
      type: "requirements",
      ownerAgentId: "scope-pm",
      content: requirements(domainSpec),
      workspaceRelativePath: "artifacts/planning/requirements.md",
      finalPackagePath: "planning/requirements.md",
      inputArtifactIds: planningInputs
    });
    const scopeArtifact = await createArtifact({
      artifactStore,
      eventStore,
      goal: options.goal,
      type: "scope",
      ownerAgentId: "scope-pm",
      content: scope(domainSpec),
      workspaceRelativePath: "artifacts/planning/scope.md",
      finalPackagePath: "planning/scope.md",
      inputArtifactIds: [requirementsArtifact.id]
    });
    const assumptionsArtifact = await createArtifact({
      artifactStore,
      eventStore,
      goal: options.goal,
      type: "assumptions",
      ownerAgentId: "scope-pm",
      content: assumptions(domainSpec),
      workspaceRelativePath: "artifacts/planning/assumptions.md",
      finalPackagePath: "planning/assumptions.md",
      inputArtifactIds: [scopeArtifact.id]
    });
    const timelineArtifact = await createArtifact({
      artifactStore,
      eventStore,
      goal: options.goal,
      type: "timeline",
      ownerAgentId: "scope-pm",
      content: timeline(domainSpec),
      workspaceRelativePath: "artifacts/planning/timeline.md",
      finalPackagePath: "planning/timeline.md",
      inputArtifactIds: [scopeArtifact.id]
    });
    const risksArtifact = await createArtifact({
      artifactStore,
      eventStore,
      goal: options.goal,
      type: "risks",
      ownerAgentId: "scope-pm",
      content: risks(domainSpec),
      workspaceRelativePath: "artifacts/planning/risks.md",
      finalPackagePath: "planning/risks.md",
      inputArtifactIds: [scopeArtifact.id, assumptionsArtifact.id]
    });

    const architectureArtifact = await createArtifact({
      artifactStore,
      eventStore,
      goal: options.goal,
      type: "architecture",
      ownerAgentId: "software-architect",
      content: architecture(domainSpec),
      workspaceRelativePath: "artifacts/technical/architecture.md",
      finalPackagePath: "technical/architecture.md",
      inputArtifactIds: [requirementsArtifact.id, scopeArtifact.id]
    });
    const schemaArtifact = await createArtifact({
      artifactStore,
      eventStore,
      goal: options.goal,
      type: "database-schema",
      ownerAgentId: "software-architect",
      content: databaseSchema(domainSpec),
      workspaceRelativePath: "artifacts/technical/database-schema.md",
      finalPackagePath: "technical/database-schema.md",
      inputArtifactIds: [architectureArtifact.id]
    });
    const apiArtifact = await createArtifact({
      artifactStore,
      eventStore,
      goal: options.goal,
      type: "api-plan",
      ownerAgentId: "software-architect",
      content: apiPlan(domainSpec),
      workspaceRelativePath: "artifacts/technical/api-plan.md",
      finalPackagePath: "technical/api-plan.md",
      inputArtifactIds: [architectureArtifact.id, schemaArtifact.id]
    });
    const taskBreakdownArtifact = await createArtifact({
      artifactStore,
      eventStore,
      goal: options.goal,
      type: "task-breakdown",
      ownerAgentId: "scope-pm",
      content: taskBreakdown(domainSpec),
      workspaceRelativePath: "artifacts/planning/task-breakdown.md",
      finalPackagePath: "planning/task-breakdown.md",
      inputArtifactIds: [requirementsArtifact.id, architectureArtifact.id, apiArtifact.id]
    });

    await eventStore.append({
      runId,
      level: "info",
      name: "app.generation.started",
      agentId: "builder",
      message: "Generating runnable app prototype.",
      data: { appName: domainSpec.appName, entitySlug: domainSpec.primaryEntity.slug }
    });
    await writeGeneratedApp(workspace, driver, domainSpec);
    await driver.copyDirectory(join(workspace.workspaceDir, "app"), join(workspace.finalPackageDir, "app"));
    const appArtifact = await artifactStore.createMarkdown({
      type: "app",
      ownerAgentId: "builder",
      content: "Generated runnable app prototype. See final-package/app/README.md.",
      workspaceRelativePath: "artifacts/app.md",
      finalPackagePath: "app/",
      inputArtifactIds: [taskBreakdownArtifact.id, architectureArtifact.id, apiArtifact.id],
      status: "exported",
      reviewStatus: "pending",
      approvalStatus: "approved"
    });
    await eventStore.append({
      runId,
      level: "info",
      name: "artifact.produced",
      agentId: "builder",
      artifactId: appArtifact.id,
      message: "Produced app prototype artifact.",
      data: { finalPackagePath: "app/" }
    });

    const appValidation = await validateGeneratedApp(workspace.finalPackageDir);
    const appValidationFailed = !appValidation.ok;

    const qaArtifact = await createArtifact({
      artifactStore,
      eventStore,
      goal: options.goal,
      type: "qa-report",
      ownerAgentId: "reviewer-qa",
      content: qaReport(appValidation.message),
      workspaceRelativePath: "artifacts/review/qa-report.md",
      finalPackagePath: "review/qa-report.md",
      inputArtifactIds: [appArtifact.id],
      reviewStatus: appValidationFailed ? "failed" : "passed"
    });
    const codeReviewArtifact = await createArtifact({
      artifactStore,
      eventStore,
      goal: options.goal,
      type: "code-review",
      ownerAgentId: "reviewer-qa",
      content: codeReview(domainSpec),
      workspaceRelativePath: "artifacts/review/code-review.md",
      finalPackagePath: "review/code-review.md",
      inputArtifactIds: [appArtifact.id],
      reviewStatus: "passed"
    });
    const knownIssuesArtifact = await createArtifact({
      artifactStore,
      eventStore,
      goal: options.goal,
      type: "known-issues",
      ownerAgentId: "reviewer-qa",
      content: knownIssues(domainSpec, appValidationFailed),
      workspaceRelativePath: "artifacts/review/known-issues.md",
      finalPackagePath: "review/known-issues.md",
      inputArtifactIds: [qaArtifact.id, codeReviewArtifact.id],
      reviewStatus: appValidationFailed ? "failed" : "passed"
    });
    const handoffArtifact = await createArtifact({
      artifactStore,
      eventStore,
      goal: options.goal,
      type: "handoff-guide",
      ownerAgentId: "delivery",
      content: handoffGuide(domainSpec),
      workspaceRelativePath: "artifacts/client/handoff-guide.md",
      finalPackagePath: "client/handoff-guide.md",
      inputArtifactIds: [qaArtifact.id, knownIssuesArtifact.id, risksArtifact.id]
    });

    for (const artifact of artifactStore.list()) {
      if (artifact.type !== "app") {
        const content = await readFile(artifact.workspacePath, "utf8");
        const finalPath = join(workspace.finalPackageDir, artifact.finalPackagePath);
        await mkdir(dirname(finalPath), { recursive: true });
        await writeFile(finalPath, content, "utf8");
      }
    }

    decisions.push({
      id: "auto-approval",
      runId,
      madeAt: new Date().toISOString(),
      madeBy: "system",
      title: "Approval mode",
      rationale: "The v0 demo uses auto-approval so the complete pipeline can run from one CLI command.",
      selectedOption: "auto-approve"
    });

    const approvals: Approval[] = artifactStore.list().map((artifact) => ({
      id: `approval-${artifact.id}`,
      runId,
      artifactId: artifact.id,
      requestedAt: artifact.createdAt,
      resolvedAt: artifact.updatedAt,
      status: artifact.approvalStatus,
      approver: "auto",
      notes: "Auto-approved by the v0 demo pipeline."
    }));

    await writeFile(join(workspace.finalPackageDir, "trace", "domain-spec.json"), JSON.stringify(domainSpec, null, 2), "utf8");
    await writeFile(join(workspace.finalPackageDir, "trace", "decisions.json"), JSON.stringify({ decisions }, null, 2), "utf8");
    await writeFile(join(workspace.finalPackageDir, "trace", "approvals.json"), JSON.stringify({ approvals }, null, 2), "utf8");
    await artifactStore.exportLineage(join(workspace.finalPackageDir, "trace", "artifact-lineage.json"));

    taskRun.status = "completed";
    taskRun.completedAt = new Date().toISOString();
    await eventStore.append({
      runId,
      level: "info",
      name: "run.completed",
      agentId: "delivery",
      artifactId: handoffArtifact.id,
      message: "Completed Agentsim demo run.",
      data: { finalPackageDir: workspace.finalPackageDir }
    });

    return {
      taskRun,
      finalPackageDir: workspace.finalPackageDir,
      artifacts: artifactStore.list(),
      decisions,
      domainSpec
    };
  } catch (error) {
    taskRun.status = "failed";
    taskRun.completedAt = new Date().toISOString();
    await eventStore.append({
      runId,
      level: "error",
      name: "run.failed",
      message: error instanceof Error ? error.message : "Unknown run failure."
    });
    throw error;
  }
}

async function createArtifact(input: {
  artifactStore: FileArtifactStore;
  eventStore: JsonlEventStore;
  goal: string;
  type: Parameters<FileArtifactStore["createMarkdown"]>[0]["type"];
  ownerAgentId: Parameters<FileArtifactStore["createMarkdown"]>[0]["ownerAgentId"];
  content: string;
  workspaceRelativePath: string;
  finalPackagePath: string;
  inputArtifactIds?: string[];
  reviewStatus?: Parameters<FileArtifactStore["createMarkdown"]>[0]["reviewStatus"];
}): Promise<Artifact> {
  const agent = getAgent(input.ownerAgentId);
  const prompt = `${agent.mission}\n\nGoal: ${input.goal}\n\nArtifact: ${input.type}`;
  const artifact = await input.artifactStore.createMarkdown({
    type: input.type,
    ownerAgentId: input.ownerAgentId,
    content: input.content,
    workspaceRelativePath: input.workspaceRelativePath,
    finalPackagePath: input.finalPackagePath,
    inputArtifactIds: input.inputArtifactIds,
    reviewStatus: input.reviewStatus,
    approvalStatus: "approved",
    status: "approved",
    prompt
  });

  await input.eventStore.append({
    runId: "",
    level: "info",
    name: "artifact.produced",
    agentId: input.ownerAgentId,
    artifactId: artifact.id,
    message: `${agent.displayName} produced ${input.type}.`,
    data: {
      artifactType: input.type,
      finalPackagePath: input.finalPackagePath,
      inputArtifactIds: input.inputArtifactIds ?? []
    }
  });

  return artifact;
}

async function validateGeneratedApp(finalPackageDir: string): Promise<{ ok: boolean; message: string }> {
  const requiredFiles = ["app/package.json", "app/README.md", "app/server.js", "app/src/App.tsx", "app/src/main.tsx"];
  const missing: string[] = [];

  for (const file of requiredFiles) {
    try {
      await readFile(join(finalPackageDir, file), "utf8");
    } catch {
      missing.push(file);
    }
  }

  if (missing.length > 0) {
    return { ok: false, message: `Missing generated app files: ${missing.join(", ")}` };
  }

  const readme = await readFile(join(finalPackageDir, "app", "README.md"), "utf8");
  if (!readme.includes("pnpm dev:api") || !readme.includes("pnpm dev:web")) {
    return { ok: false, message: "Generated app README is missing run commands." };
  }

  return { ok: true, message: "Generated app structure and run instructions are present." };
}

function createRunId(): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
  return `run-${stamp}`;
}
