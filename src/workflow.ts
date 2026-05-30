import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FileArtifactStore } from "./core/artifacts.js";
import { JsonlEventStore } from "./core/events.js";
import { validateFinalPackage } from "./core/final-package-validation.js";
import { redactSecrets } from "./core/redact.js";
import { LocalFilesystemWorkspaceDriver } from "./core/workspace.js";
import { softwareFreelancePack } from "./domain/software-freelance-pack.js";
import { getAgent } from "./agents/agents.js";
import { agentSteps } from "./agents/steps.js";
import type { DomainSpec } from "./domain/domain-spec.js";
import type { AgentContext, Approval, Artifact, ArtifactType, Decision, ModelProvider, RunSummary, TaskRun } from "./types.js";

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
  const safeGoal = redactSecrets(options.goal);
  const driver = new LocalFilesystemWorkspaceDriver();
  const workspace = await driver.create(runId, outputRoot);
  const eventStore = new JsonlEventStore(runId, join(workspace.finalPackageDir, "trace", "events.jsonl"));
  const artifactStore = new FileArtifactStore(workspace);
  const decisions: Decision[] = [];
  const domainPack = softwareFreelancePack;
  const domainSpec = domainPack.inferDomainSpec(safeGoal);
  const taskRun: TaskRun = {
    id: runId,
    goal: safeGoal,
    startedAt: new Date().toISOString(),
    status: "RUNNING",
    modelMode: options.modelProvider.mode,
    outputDir: workspace.rootDir
  };

  await eventStore.append({
    level: "info",
    name: "run.started",
    message: `Started Agentsim demo run ${runId}.`,
    data: {
      goal: safeGoal,
      modelMode: options.modelProvider.mode,
      provider: options.modelProvider.name,
      domainPackId: domainPack.id,
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
      : "A live Chat Completions-compatible provider was configured for this run.",
    selectedOption: options.modelProvider.mode
  });

  try {
    if (options.modelProvider.mode === "live") {
      await eventStore.append({
        level: "info",
        name: "model.run_brief.started",
        message: "Requesting live model run brief."
      });
      const runBrief = await options.modelProvider.generate({
        system: "You are the planning coordinator for Agentsim. Return concise Markdown only.",
        prompt: `Create a brief execution note for this freelance software delivery goal: ${safeGoal}`,
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
        level: "info",
        name: "model.run_brief.completed",
        message: "Live model run brief completed.",
        data: { model: runBrief.model, contentLength: runBrief.content.length }
      });
    }

    const artifactsByType: Partial<Record<ArtifactType, Artifact>> = {};
    const context: AgentContext = {
      runId,
      goal: safeGoal,
      domainSpec,
      modelProvider: options.modelProvider,
      workspace,
      workspaceDriver: driver,
      artifactsByType
    };

    for (const step of agentSteps) {
      const missingInputs = step.requiredInputs.filter((type) => !artifactsByType[type]);
      if (missingInputs.length > 0) {
        throw new Error(`Agent step ${step.id} is missing inputs: ${missingInputs.join(", ")}`);
      }

      await eventStore.append({
        level: "info",
        name: "agent.step.started",
        agentId: step.ownerAgentId,
        message: `${getAgent(step.ownerAgentId).displayName} started ${step.outputType}.`,
        data: {
          stepId: step.id,
          outputType: step.outputType,
          requiredInputs: step.requiredInputs,
          reviewRequired: step.reviewRequired
        }
      });

      const stepResult = await step.execute(context);
      const inputArtifactIds = step.requiredInputs.map((type) => artifactsByType[type]?.id).filter(isString);
      const artifact = await createArtifact({
        artifactStore,
        eventStore,
        goal: safeGoal,
        stepId: step.id,
        type: step.outputType,
        ownerAgentId: step.ownerAgentId,
        content: stepResult.content,
        workspaceRelativePath: stepResult.workspaceRelativePath,
        finalPackagePath: stepResult.finalPackagePath,
        inputArtifactIds,
        status: stepResult.status,
        reviewStatus: stepResult.reviewStatus,
        approvalStatus: stepResult.approvalStatus
      });
      artifactsByType[step.outputType] = artifact;
    }

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
      rationale: "The v0 demo resolves artifact approvals inside the local pipeline after review-required steps pass.",
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

    const validationResult = await validateFinalPackage({
      finalPackageDir: workspace.finalPackageDir,
      artifacts: artifactStore.list(),
      domainPack
    });

    if (!validationResult.ok) {
      taskRun.status = "REVIEW_FAILED";
      taskRun.failureReason = "VALIDATION_FAILED";
      taskRun.completedAt = new Date().toISOString();
      await writeRunSummary({
        runId,
        goal: safeGoal,
        status: taskRun.status,
        modelMode: taskRun.modelMode,
        provider: options.modelProvider.name,
        finalPackageDir: workspace.finalPackageDir,
        artifactCount: artifactStore.list().length,
        validationResult,
        failures: validationResult.failures
      }, workspace.finalPackageDir);
      await eventStore.append({
        level: "error",
        name: "run.validation_failed",
        agentId: "reviewer-qa",
        message: "Final package validation failed.",
        data: { failures: validationResult.failures }
      });
      throw new Error(`Final package validation failed: ${validationResult.failures.join("; ")}`);
    }

    taskRun.status = "COMPLETED";
    taskRun.completedAt = new Date().toISOString();
    await writeRunSummary({
      runId,
      goal: safeGoal,
      status: taskRun.status,
      modelMode: taskRun.modelMode,
      provider: options.modelProvider.name,
      finalPackageDir: workspace.finalPackageDir,
      artifactCount: artifactStore.list().length,
      validationResult,
      failures: []
    }, workspace.finalPackageDir);
    await eventStore.append({
      level: "info",
      name: "run.completed",
      agentId: "delivery",
      artifactId: artifactsByType["handoff-notes"]?.id,
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
    if (taskRun.status !== "REVIEW_FAILED") {
      taskRun.status = "FAILED";
      taskRun.failureReason = "UNKNOWN";
    }
    taskRun.completedAt = new Date().toISOString();
    await eventStore.append({
      level: "error",
      name: "run.failed",
      message: error instanceof Error ? error.message : "Unknown run failure."
    });
    throw error;
  }
}

async function writeRunSummary(summary: RunSummary, finalPackageDir: string): Promise<void> {
  await writeFile(join(finalPackageDir, "trace", "run-summary.json"), JSON.stringify(summary, null, 2), "utf8");
}

async function createArtifact(input: {
  artifactStore: FileArtifactStore;
  eventStore: JsonlEventStore;
  goal: string;
  stepId: string;
  type: Parameters<FileArtifactStore["createMarkdown"]>[0]["type"];
  ownerAgentId: Parameters<FileArtifactStore["createMarkdown"]>[0]["ownerAgentId"];
  content: string;
  workspaceRelativePath: string;
  finalPackagePath: string;
  inputArtifactIds?: string[];
  status?: Parameters<FileArtifactStore["createMarkdown"]>[0]["status"];
  reviewStatus?: Parameters<FileArtifactStore["createMarkdown"]>[0]["reviewStatus"];
  approvalStatus?: Parameters<FileArtifactStore["createMarkdown"]>[0]["approvalStatus"];
}): Promise<Artifact> {
  const agent = getAgent(input.ownerAgentId);
  const safeContent = redactSecrets(input.content);
  const prompt = `${agent.mission}\n\nGoal: ${input.goal}\n\nStep: ${input.stepId}\nArtifact: ${input.type}`;
  const artifact = await input.artifactStore.createMarkdown({
    type: input.type,
    ownerAgentId: input.ownerAgentId,
    content: safeContent,
    workspaceRelativePath: input.workspaceRelativePath,
    finalPackagePath: input.finalPackagePath,
    inputArtifactIds: input.inputArtifactIds,
    reviewStatus: input.reviewStatus,
    approvalStatus: input.approvalStatus,
    status: input.status,
    prompt
  });

  await input.eventStore.append({
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

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function createRunId(): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
  return `run-${stamp}`;
}
