import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getAgent } from "./agents/agents.js";
import { agentSteps as defaultAgentSteps } from "./agents/steps.js";
import { FileArtifactStore } from "./core/artifacts.js";
import { CompositeEventStore, JsonlEventStore } from "./core/events.js";
import { validateFinalPackage as defaultValidateFinalPackage } from "./core/final-package-validation.js";
import { safeJoin } from "./core/paths.js";
import { redactSecrets } from "./core/redact.js";
import { LocalApprovalsRepo, LocalArtifactsRepo, LocalMessagesRepo, LocalRunsRepo, LocalTasksRepo } from "./core/repositories.js";
import { areAllTasksTerminal, getReadyTasks, hasBlockedTasks, hasFailedTasks, markReadyTasks } from "./core/scheduler.js";
import { compileAgentStepsToTasks } from "./core/task-compiler.js";
import { ToolApprovalRequiredError } from "./core/tools.js";
import { LocalFilesystemWorkspaceDriver } from "./core/workspace.js";
import type { DomainSpec } from "./domain/domain-spec.js";
import { softwareFreelancePack } from "./domain/software-freelance-pack.js";
import type {
  AgentActionRecord,
  AgentContext,
  AgentMessageRecord,
  AgentStep,
  Approval,
  Artifact,
  ArtifactType,
  Decision,
  DomainPack,
  EventStore,
  ModelProvider,
  Run,
  RunStatus,
  RunSummary,
  Task,
  TaskRun,
  TaskStatus,
  ValidationResult,
  Workspace,
  WorkspaceDriver
} from "./types.js";

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

export interface RunOrchestratorOptions extends RunDemoOptions {
  agentSteps?: AgentStep[];
  domainPack?: DomainPack;
  validateFinalPackage?: typeof defaultValidateFinalPackage;
}

export type TaskExecutionResult =
  | { status: "completed"; artifact: Artifact; actionRecord: AgentActionRecord; messages: AgentMessageRecord[] }
  | { status: "waiting_for_approval"; approvalId: string }
  | { status: "failed"; error: string };

interface OrchestratorRuntime {
  runId: string;
  safeGoal: string;
  modelProvider: ModelProvider;
  domainPack: DomainPack;
  domainSpec: DomainSpec;
  workspace: Workspace;
  workspaceDriver: WorkspaceDriver;
  artifactStore: FileArtifactStore;
  eventStore: EventStore;
  runsRepo: LocalRunsRepo;
  tasksRepo: LocalTasksRepo;
  artifactsRepo: LocalArtifactsRepo;
  messagesRepo: LocalMessagesRepo;
  approvalsRepo: LocalApprovalsRepo;
  artifactsByType: Partial<Record<ArtifactType, Artifact>>;
  agentActions: AgentActionRecord[];
  agentMessages: AgentMessageRecord[];
  decisions: Decision[];
  steps: AgentStep[];
}

export async function runOrchestrator(options: RunOrchestratorOptions): Promise<RunDemoResult> {
  const outputRoot = options.outputRoot ?? "outputs";
  const runId = options.runId ?? createRunId();
  const safeGoal = redactSecrets(options.goal);
  const driver = new LocalFilesystemWorkspaceDriver();
  const workspace = await driver.create(runId, outputRoot);
  const eventStore = new CompositeEventStore([
    new JsonlEventStore(runId, safeJoin(workspace.finalPackageDir, "trace/events.jsonl")),
    new JsonlEventStore(runId, safeJoin(workspace.rootDir, "state/events.jsonl"))
  ]);
  const artifactStore = new FileArtifactStore(workspace);
  const runsRepo = new LocalRunsRepo(workspace.rootDir);
  const tasksRepo = new LocalTasksRepo(workspace.rootDir);
  const artifactsRepo = new LocalArtifactsRepo(workspace.rootDir);
  const messagesRepo = new LocalMessagesRepo(workspace.rootDir);
  const approvalsRepo = new LocalApprovalsRepo(workspace.rootDir);
  const domainPack = options.domainPack ?? softwareFreelancePack;
  const domainSpec = domainPack.inferDomainSpec(safeGoal);
  const steps = options.agentSteps ?? defaultAgentSteps;
  const validateFinalPackage = options.validateFinalPackage ?? defaultValidateFinalPackage;
  const decisions: Decision[] = [];
  const agentActions: AgentActionRecord[] = [];
  const agentMessages: AgentMessageRecord[] = [];
  const artifactsByType: Partial<Record<ArtifactType, Artifact>> = {};
  const taskRun: TaskRun = {
    id: runId,
    goal: safeGoal,
    startedAt: new Date().toISOString(),
    status: "RUNNING",
    modelMode: options.modelProvider.mode,
    outputDir: workspace.rootDir
  };

  const runtime: OrchestratorRuntime = {
    runId,
    safeGoal,
    modelProvider: options.modelProvider,
    domainPack,
    domainSpec,
    workspace,
    workspaceDriver: driver,
    artifactStore,
    eventStore,
    runsRepo,
    tasksRepo,
    artifactsRepo,
    messagesRepo,
    approvalsRepo,
    artifactsByType,
    agentActions,
    agentMessages,
    decisions,
    steps
  };

  try {
    await initializeRun(runtime, taskRun);
    await maybeCreateLiveRunBrief(runtime);
    await runSchedulerLoop(runtime);
    await exportFinalPackageArtifacts(runtime);
    await writeTraceFiles(runtime);
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
      await failRun(runtime, "VALIDATION_FAILED", "Final package validation failed.", { failures: validationResult.failures });
      throw new Error(`Final package validation failed: ${validationResult.failures.join("; ")}`);
    }

    taskRun.status = "COMPLETED";
    taskRun.completedAt = new Date().toISOString();
    await runsRepo.updateRunStatus("completed");
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
    if (error instanceof RunWaitingForApprovalError) {
      taskRun.status = "WAITING_HUMAN_APPROVAL";
      taskRun.failureReason = undefined;
      return {
        taskRun,
        finalPackageDir: workspace.finalPackageDir,
        artifacts: artifactStore.list(),
        decisions,
        domainSpec
      };
    }

    if (taskRun.status !== "REVIEW_FAILED") {
      taskRun.status = "FAILED";
      taskRun.failureReason = "UNKNOWN";
    }
    taskRun.completedAt = new Date().toISOString();
    const currentRun = await safeGetRun(runsRepo);
    if (currentRun?.status !== "failed" && currentRun?.status !== "waiting_for_approval") {
      await runsRepo.updateRunStatus("failed", error instanceof Error ? redactSecrets(error.message) : "Unknown run failure.");
    }
    if (!(error instanceof RunWaitingForApprovalError)) {
      await eventStore.append({
        level: "error",
        name: "run.failed",
        message: error instanceof Error ? error.message : "Unknown run failure."
      });
    }
    throw error;
  }
}

export async function executeTask(runtime: OrchestratorRuntime, taskId: string): Promise<TaskExecutionResult> {
  const task = await runtime.tasksRepo.getTask(taskId);
  if (task.status !== "ready") {
    return { status: "failed", error: `Task ${taskId} is not ready; current status is ${task.status}.` };
  }

  const step = runtime.steps.find((candidate) => candidate.id === task.id);
  if (!step) {
    return { status: "failed", error: `No agent step found for task ${task.id}.` };
  }

  await runtime.tasksRepo.incrementTaskAttempt(task.id);
  await runtime.tasksRepo.updateTaskStatus(task.id, "running");
  await runtime.eventStore.append({
    level: "info",
    name: "task.started",
    agentId: step.ownerAgentId,
    taskId: task.id,
    message: `Task ${task.id} started.`,
    data: {
      kind: task.kind,
      dependsOn: task.dependsOn,
      outputArtifactType: task.outputArtifactType
    }
  });

  const missingInputs = step.requiredInputs.filter((type) => !runtime.artifactsByType[type]);
  if (missingInputs.length > 0) {
    return { status: "failed", error: `Agent step ${step.id} is missing inputs: ${missingInputs.join(", ")}` };
  }

  const inputArtifactIds = step.requiredInputs.map((type) => runtime.artifactsByType[type]?.id).filter(isString);
  const currentMessages = createAgentMessages({
    runId: runtime.runId,
    stepId: step.id,
    action: step.action,
    to: step.ownerAgentId,
    outputType: step.outputType,
    reviewRequired: step.reviewRequired,
    inputArtifacts: step.requiredInputs.map((type) => runtime.artifactsByType[type]).filter(isArtifact)
  });

  for (const message of currentMessages) {
    await runtime.messagesRepo.createMessage(message);
    await runtime.eventStore.append({
      level: "info",
      name: "agent.message.sent",
      agentId: message.to,
      artifactId: message.artifactId,
      message: `${message.from} sent ${message.type} to ${message.to}.`,
      data: {
        messageId: message.id,
        type: message.type,
        from: message.from,
        to: message.to,
        stepId: message.stepId,
        artifactType: message.artifactType,
        expectedOutput: message.expectedOutput
      }
    });
  }

  const context: AgentContext = {
    runId: runtime.runId,
    goal: runtime.safeGoal,
    domainSpec: runtime.domainSpec,
    modelProvider: runtime.modelProvider,
    workspace: runtime.workspace,
    workspaceDriver: runtime.workspaceDriver,
    artifactsByType: runtime.artifactsByType,
    currentMessages
  };

  await runtime.eventStore.append({
    level: "info",
    name: "agent.action.started",
    agentId: step.ownerAgentId,
    message: `${getAgent(step.ownerAgentId).displayName} started ${step.action}.`,
    data: {
      stepId: step.id,
      action: step.action,
      outputType: step.outputType,
      requiredInputs: step.requiredInputs,
      reviewRequired: step.reviewRequired
    }
  });

  const actionRecord: AgentActionRecord = {
    id: randomUUID(),
    runId: runtime.runId,
    stepId: step.id,
    agentId: step.ownerAgentId,
    action: step.action,
    outputType: step.outputType,
    inputMessageIds: currentMessages.map((message) => message.id),
    inputArtifactIds,
    status: "started",
    modelMode: runtime.modelProvider.mode,
    provider: runtime.modelProvider.name,
    reviewRequired: step.reviewRequired,
    startedAt: new Date().toISOString()
  };

  try {
    const stepResult = await step.execute(context);
    const artifact = await createArtifact({
      artifactStore: runtime.artifactStore,
      eventStore: runtime.eventStore,
      goal: runtime.safeGoal,
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

    actionRecord.status = "completed";
    actionRecord.completedAt = new Date().toISOString();
    actionRecord.outputArtifactId = artifact.id;
    actionRecord.outputSource = stepResult.outputSource;
    actionRecord.model = stepResult.model;
    await runtime.eventStore.append({
      level: "info",
      name: "agent.action.completed",
      agentId: step.ownerAgentId,
      artifactId: artifact.id,
      message: `${getAgent(step.ownerAgentId).displayName} completed ${step.action}.`,
      data: {
        stepId: step.id,
        action: step.action,
        outputType: step.outputType,
        outputSource: stepResult.outputSource,
        model: stepResult.model,
        summary: stepResult.actionSummary
      }
    });

    return { status: "completed", artifact, actionRecord, messages: currentMessages };
  } catch (error) {
    if (error instanceof ToolApprovalRequiredError) {
      const approval = await runtime.approvalsRepo.createApproval({
        runId: runtime.runId,
        taskId: task.id,
        requestedBy: step.ownerAgentId,
        action: error.action,
        riskLevel: "high",
        notes: error.message
      });
      return { status: "waiting_for_approval", approvalId: approval.id };
    }

    actionRecord.status = "failed";
    actionRecord.completedAt = new Date().toISOString();
    actionRecord.error = error instanceof Error ? redactSecrets(error.message) : "Unknown agent action failure.";
    await runtime.eventStore.append({
      level: "error",
      name: "agent.action.failed",
      agentId: step.ownerAgentId,
      message: `${getAgent(step.ownerAgentId).displayName} failed ${step.action}.`,
      data: {
        stepId: step.id,
        action: step.action,
        outputType: step.outputType,
        error: actionRecord.error
      }
    });
    return { status: "failed", error: actionRecord.error };
  }
}

export async function handleTaskResult(runtime: OrchestratorRuntime, taskId: string, result: TaskExecutionResult): Promise<void> {
  if (result.status === "completed") {
    await runtime.artifactsRepo.createArtifactRecord(result.artifact);
    runtime.artifactsByType[result.artifact.type] = result.artifact;
    runtime.agentActions.push(result.actionRecord);
    runtime.agentMessages.push(...result.messages);
    await runtime.tasksRepo.updateTaskStatus(taskId, "completed");
    await runtime.eventStore.append({
      level: "info",
      name: "task.completed",
      agentId: result.artifact.ownerAgentId,
      artifactId: result.artifact.id,
      taskId,
      message: `Task ${taskId} completed.`,
      data: {
        outputArtifactType: result.artifact.type,
        outputArtifactId: result.artifact.id
      }
    });
    const tasks = markReadyTasks(await runtime.tasksRepo.listTasksByRun());
    await runtime.tasksRepo.saveTasks(tasks);
    return;
  }

  if (result.status === "waiting_for_approval") {
    await runtime.tasksRepo.updateTaskStatus(taskId, "waiting_for_approval", result.approvalId);
    await runtime.runsRepo.updateRunStatus("waiting_for_approval", result.approvalId);
    await runtime.eventStore.append({
      level: "warn",
      name: "run.waiting_for_approval",
      taskId,
      message: `Run is waiting for approval ${result.approvalId}.`,
      data: { approvalId: result.approvalId }
    });
    throw new RunWaitingForApprovalError(result.approvalId);
  }

  await retryOrFailTask(runtime, taskId, new Error(result.error));
}

export async function retryOrFailTask(runtime: OrchestratorRuntime, taskId: string, error: unknown): Promise<void> {
  const task = await runtime.tasksRepo.getTask(taskId);
  const message = error instanceof Error ? redactSecrets(error.message) : "Unknown task failure.";
  if (task.attempts < task.maxAttempts) {
    await runtime.tasksRepo.updateTaskStatus(taskId, "ready", message);
    await runtime.eventStore.append({
      level: "warn",
      name: "task.retry_scheduled",
      agentId: task.assignedAgentId,
      taskId,
      message: `Task ${taskId} will retry.`,
      data: { attempts: task.attempts, maxAttempts: task.maxAttempts, error: message }
    });
    return;
  }

  await runtime.tasksRepo.updateTaskStatus(taskId, "failed", message);
  await failRun(runtime, "TASK_FAILED", `Task ${taskId} failed.`, { taskId, error: message });
  throw new Error(message);
}

export function resolveRunRoot(outputRoot: string, runId: string): string {
  return join(outputRoot, runId);
}

async function initializeRun(runtime: OrchestratorRuntime, taskRun: TaskRun): Promise<void> {
  const runState: Run = {
    id: runtime.runId,
    userGoal: runtime.safeGoal,
    status: "running",
    modelMode: runtime.modelProvider.mode,
    outputRoot: runtime.workspace.rootDir,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await runtime.runsRepo.createRun(runState);
  await runtime.tasksRepo.saveTasks(compileAgentStepsToTasks(runtime.runId, runtime.steps));
  await runtime.eventStore.append({
    level: "info",
    name: "run.started",
    message: `Started Agentsim demo run ${runtime.runId}.`,
    data: {
      goal: runtime.safeGoal,
      modelMode: taskRun.modelMode,
      provider: runtime.modelProvider.name,
      domainPackId: runtime.domainPack.id,
      appName: runtime.domainSpec.appName,
      domain: runtime.domainSpec.domain,
      primaryEntity: runtime.domainSpec.primaryEntity.name
    }
  });

  runtime.decisions.push({
    id: "domain-spec",
    runId: runtime.runId,
    madeAt: new Date().toISOString(),
    madeBy: "system",
    title: "Domain inference",
    rationale: `Inferred ${runtime.domainSpec.domain} from the user goal and selected ${runtime.domainSpec.primaryEntity.name} as the primary workflow entity.`,
    selectedOption: runtime.domainSpec.appName
  });
  runtime.decisions.push({
    id: "model-provider",
    runId: runtime.runId,
    madeAt: new Date().toISOString(),
    madeBy: "system",
    title: "Model provider selection",
    rationale: runtime.modelProvider.mode === "mock"
      ? "No live model key was required; deterministic mock mode keeps the demo and tests reproducible."
      : "A live Chat Completions-compatible provider was configured for this run.",
    selectedOption: runtime.modelProvider.mode
  });
}

async function maybeCreateLiveRunBrief(runtime: OrchestratorRuntime): Promise<void> {
  if (runtime.modelProvider.mode !== "live") {
    return;
  }

  await runtime.eventStore.append({
    level: "info",
    name: "model.run_brief.started",
    message: "Requesting live model run brief."
  });
  const runBrief = await runtime.modelProvider.generate({
    system: "You are the planning coordinator for Agentsim. Return concise Markdown only.",
    prompt: `Create a brief execution note for this freelance software delivery goal: ${runtime.safeGoal}`,
    purpose: "run-brief"
  });
  runtime.decisions.push({
    id: "live-model-brief",
    runId: runtime.runId,
    madeAt: new Date().toISOString(),
    madeBy: "system",
    title: "Live model run brief",
    rationale: "The live provider was exercised before deterministic package assembly.",
    selectedOption: runBrief.model
  });
  await runtime.eventStore.append({
    level: "info",
    name: "model.run_brief.completed",
    message: "Live model run brief completed.",
    data: { model: runBrief.model, contentLength: runBrief.content.length }
  });
}

async function runSchedulerLoop(runtime: OrchestratorRuntime): Promise<void> {
  const stepOrder = new Map(runtime.steps.map((step, index) => [step.id, index]));

  while (true) {
    const marked = markReadyTasks(await runtime.tasksRepo.listTasksByRun());
    await runtime.tasksRepo.saveTasks(marked);
    const tasks = await runtime.tasksRepo.listTasksByRun();

    if (tasks.some((task) => task.status === "waiting_for_approval")) {
      await runtime.runsRepo.updateRunStatus("waiting_for_approval");
      throw new RunWaitingForApprovalError("pending");
    }

    if (hasFailedTasks(tasks)) {
      const failed = tasks.find((task) => task.status === "failed");
      await failRun(runtime, "TASK_FAILED", `Task ${failed?.id ?? "unknown"} failed.`, { taskId: failed?.id, error: failed?.failureReason });
      throw new Error(failed?.failureReason ?? `Task ${failed?.id ?? "unknown"} failed.`);
    }

    if (areAllTasksTerminal(tasks)) {
      return;
    }

    if (hasBlockedTasks(tasks)) {
      await failRun(runtime, "TASK_BLOCKED", "Task graph is blocked by a failed dependency.");
      throw new Error("Task graph is blocked by a failed dependency.");
    }

    const readyTask = getReadyTasks(tasks)
      .sort((left, right) => (stepOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (stepOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER))[0];

    if (!readyTask) {
      await failRun(runtime, "NO_READY_TASKS", "No ready tasks remain, but the run is not complete.");
      throw new Error("No ready tasks remain, but the run is not complete.");
    }

    await handleTaskResult(runtime, readyTask.id, await executeTask(runtime, readyTask.id));
  }
}

async function exportFinalPackageArtifacts(runtime: OrchestratorRuntime): Promise<void> {
  for (const artifact of runtime.artifactStore.list()) {
    if (artifact.type !== "app") {
      const content = await readFile(artifact.workspacePath, "utf8");
      const finalPath = safeJoin(runtime.workspace.finalPackageDir, artifact.finalPackagePath);
      await mkdir(dirname(finalPath), { recursive: true });
      await writeFile(finalPath, content, "utf8");
    }
  }
}

async function writeTraceFiles(runtime: OrchestratorRuntime): Promise<void> {
  runtime.decisions.push({
    id: "auto-approval",
    runId: runtime.runId,
    madeAt: new Date().toISOString(),
    madeBy: "system",
    title: "Approval mode",
    rationale: "The v0 demo resolves artifact approvals inside the local pipeline after review-required steps pass.",
    selectedOption: "auto-approve"
  });

  const approvals: Approval[] = runtime.artifactStore.list().map((artifact) => ({
    id: `approval-${artifact.id}`,
    runId: runtime.runId,
    artifactId: artifact.id,
    requestedAt: artifact.createdAt,
    resolvedAt: artifact.updatedAt,
    status: artifact.approvalStatus,
    approver: "auto",
    notes: "Auto-approved by the v0 demo pipeline."
  }));
  for (const approval of approvals) {
    await runtime.approvalsRepo.createApproval(approval);
  }

  await writeFile(safeJoin(runtime.workspace.finalPackageDir, "trace/domain-spec.json"), JSON.stringify(runtime.domainSpec, null, 2), "utf8");
  await writeFile(safeJoin(runtime.workspace.finalPackageDir, "trace/decisions.json"), JSON.stringify({ decisions: runtime.decisions }, null, 2), "utf8");
  await writeFile(safeJoin(runtime.workspace.finalPackageDir, "trace/approvals.json"), JSON.stringify({ approvals }, null, 2), "utf8");
  await writeFile(safeJoin(runtime.workspace.finalPackageDir, "trace/agent-messages.json"), JSON.stringify({ messages: runtime.agentMessages }, null, 2), "utf8");
  await writeFile(safeJoin(runtime.workspace.finalPackageDir, "trace/agent-actions.json"), JSON.stringify({ actions: runtime.agentActions }, null, 2), "utf8");
  await runtime.artifactStore.exportLineage(safeJoin(runtime.workspace.finalPackageDir, "trace/artifact-lineage.json"));
}

async function writeRunSummary(summary: RunSummary, finalPackageDir: string): Promise<void> {
  await writeFile(safeJoin(finalPackageDir, "trace/run-summary.json"), JSON.stringify(summary, null, 2), "utf8");
}

async function createArtifact(input: {
  artifactStore: FileArtifactStore;
  eventStore: EventStore;
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

async function failRun(runtime: OrchestratorRuntime, failureReason: string, message: string, data?: Record<string, unknown>): Promise<void> {
  await runtime.runsRepo.updateRunStatus("failed", failureReason);
  await runtime.eventStore.append({
    level: "error",
    name: failureReason === "VALIDATION_FAILED" ? "run.validation_failed" : "run.failed",
    message,
    data
  });
}

async function safeGetRun(runsRepo: LocalRunsRepo): Promise<Run | undefined> {
  try {
    return await runsRepo.getRun();
  } catch {
    return undefined;
  }
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isArtifact(value: Artifact | undefined): value is Artifact {
  return Boolean(value);
}

function createAgentMessages(input: {
  runId: string;
  stepId: string;
  action: string;
  to: AgentMessageRecord["to"];
  outputType: ArtifactType;
  reviewRequired: boolean;
  inputArtifacts: Artifact[];
}): AgentMessageRecord[] {
  const now = new Date().toISOString();

  if (input.inputArtifacts.length === 0) {
    return [{
      id: randomUUID(),
      runId: input.runId,
      type: "task.assignment",
      from: "orchestrator",
      to: input.to,
      stepId: input.stepId,
      question: `Produce ${input.outputType} for the current client goal.`,
      expectedOutput: input.action,
      createdAt: now
    }];
  }

  return input.inputArtifacts.map((artifact) => ({
    id: randomUUID(),
    runId: input.runId,
    type: input.reviewRequired ? "review.request" : "artifact.handoff",
    from: artifact.ownerAgentId,
    to: input.to,
    stepId: input.stepId,
    artifactId: artifact.id,
    artifactType: artifact.type,
    question: input.reviewRequired
      ? `Review ${artifact.type} for blockers before ${input.action}.`
      : `Use ${artifact.type} as input for ${input.action}.`,
    expectedOutput: input.reviewRequired
      ? "List blocking issues only, or pass the artifact if acceptable."
      : `Produce ${input.outputType} using the provided artifact context.`,
    createdAt: now
  }));
}

function createRunId(): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
  return `run-${stamp}`;
}

class RunWaitingForApprovalError extends Error {
  constructor(readonly approvalId: string) {
    super(`Run is waiting for approval: ${approvalId}`);
  }
}
