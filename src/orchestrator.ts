import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { getAgent } from "./agents/agents.js";
import { agentSteps as defaultAgentSteps } from "./agents/steps.js";
import { FileArtifactStore } from "./core/artifacts.js";
import { assembleContextPackage, evaluateContextPackages, validateContextPackage } from "./core/context.js";
import { CompositeEventStore, JsonlEventStore } from "./core/events.js";
import { validateFinalPackage as defaultValidateFinalPackage } from "./core/final-package-validation.js";
import { safeJoin } from "./core/paths.js";
import { redactSecrets } from "./core/redact.js";
import { LocalAgentActionsRepo, LocalApprovalsRepo, LocalArtifactsRepo, LocalContextPackagesRepo, LocalMessagesRepo, LocalRunsRepo, LocalTasksRepo } from "./core/repositories.js";
import { createFixTask, reviewResultFromValidation } from "./core/review-loop.js";
import { areAllTasksTerminal, getReadyTasks, hasBlockedTasks, hasFailedTasks, markReadyTasks } from "./core/scheduler.js";
import { compileAgentStepsToTasks } from "./core/task-compiler.js";
import { createToolRuntime, hasApprovedAction, requestToolApproval } from "./core/tool-runtime.js";
import { ToolApprovalRequiredError } from "./core/tools.js";
import { LocalFilesystemWorkspaceDriver } from "./core/workspace.js";
import type { DomainInferenceResult } from "./domain/domain-inference.js";
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
  ContextPackage,
  Decision,
  DomainPack,
  EventStore,
  ModelProvider,
  Run,
  RunSummary,
  Task,
  TaskRun,
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
  allowCommands?: boolean;
  enableRepairLoop?: boolean;
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
  domainInference: DomainInferenceResult;
  workspace: Workspace;
  workspaceDriver: WorkspaceDriver;
  artifactStore: FileArtifactStore;
  eventStore: EventStore;
  runsRepo: LocalRunsRepo;
  tasksRepo: LocalTasksRepo;
  artifactsRepo: LocalArtifactsRepo;
  agentActionsRepo: LocalAgentActionsRepo;
  contextPackagesRepo: LocalContextPackagesRepo;
  messagesRepo: LocalMessagesRepo;
  approvalsRepo: LocalApprovalsRepo;
  artifactsByType: Partial<Record<ArtifactType, Artifact>>;
  agentActions: AgentActionRecord[];
  agentMessages: AgentMessageRecord[];
  contextPackages: ContextPackage[];
  decisions: Decision[];
  steps: AgentStep[];
  validateFinalPackage: typeof defaultValidateFinalPackage;
  allowCommands: boolean;
  enableRepairLoop: boolean;
}

export async function runOrchestrator(options: RunOrchestratorOptions): Promise<RunDemoResult> {
  const outputRoot = options.outputRoot ?? "outputs";
  const runId = options.runId ?? createRunId();
  const safeGoal = redactSecrets(options.goal);
  const driver = new LocalFilesystemWorkspaceDriver();
  const workspace = await driver.create(runId, outputRoot);
  const eventStore = new CompositeEventStore(runId, [
    new JsonlEventStore(runId, safeJoin(workspace.finalPackageDir, "trace/events.jsonl")),
    new JsonlEventStore(runId, safeJoin(workspace.rootDir, "state/events.jsonl"))
  ]);
  const artifactStore = new FileArtifactStore(workspace);
  const runsRepo = new LocalRunsRepo(workspace.rootDir);
  const tasksRepo = new LocalTasksRepo(workspace.rootDir);
  const artifactsRepo = new LocalArtifactsRepo(workspace.rootDir);
  const agentActionsRepo = new LocalAgentActionsRepo(workspace.rootDir);
  const contextPackagesRepo = new LocalContextPackagesRepo(workspace.rootDir);
  const messagesRepo = new LocalMessagesRepo(workspace.rootDir);
  const approvalsRepo = new LocalApprovalsRepo(workspace.rootDir);
  const domainPack = options.domainPack ?? softwareFreelancePack;
  const domainInference = inferWithMetadata(domainPack, safeGoal);
  const domainSpec = domainInference.spec;
  const steps = options.agentSteps ?? defaultAgentSteps;
  const decisions: Decision[] = [];
  const agentActions: AgentActionRecord[] = [];
  const agentMessages: AgentMessageRecord[] = [];
  const contextPackages: ContextPackage[] = [];
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
    domainInference,
    workspace,
    workspaceDriver: driver,
    artifactStore,
    eventStore,
    runsRepo,
    tasksRepo,
    artifactsRepo,
    agentActionsRepo,
    contextPackagesRepo,
    messagesRepo,
    approvalsRepo,
    artifactsByType,
    agentActions,
    agentMessages,
    contextPackages,
    decisions,
    steps,
    validateFinalPackage: options.validateFinalPackage ?? defaultValidateFinalPackage,
    allowCommands: options.allowCommands ?? false,
    enableRepairLoop: options.enableRepairLoop ?? false
  };

  try {
    await initializeRun(runtime, taskRun);
    await maybeCreateLiveRunBrief(runtime);
    await runSchedulerLoop(runtime);
    return await completeRun(runtime, taskRun);
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

export async function resumeOrchestrator(options: Omit<RunOrchestratorOptions, "goal" | "runId"> & { runId: string }): Promise<RunDemoResult> {
  const outputRoot = options.outputRoot ?? "outputs";
  const runRoot = resolveRunRoot(outputRoot, options.runId);
  await assertRunExists(runRoot, options.runId);

  const runsRepo = new LocalRunsRepo(runRoot);
  const existingRun = await runsRepo.getRun();
  if (existingRun.status === "completed" || existingRun.status === "failed" || existingRun.status === "cancelled") {
    throw new Error(`Run ${options.runId} cannot be resumed from terminal status ${existingRun.status}.`);
  }

  const approvalsRepo = new LocalApprovalsRepo(runRoot);
  const pendingApprovals = (await approvalsRepo.listApprovalsByRun()).filter((approval) => approval.status === "pending");
  if (pendingApprovals.length > 0) {
    throw new Error(`Run ${options.runId} still has pending approvals: ${pendingApprovals.map((approval) => approval.id).join(", ")}`);
  }

  const driver = new LocalFilesystemWorkspaceDriver();
  const workspace = await driver.create(options.runId, outputRoot);
  const eventStore = new CompositeEventStore(options.runId, [
    new JsonlEventStore(options.runId, safeJoin(workspace.finalPackageDir, "trace/events.jsonl")),
    new JsonlEventStore(options.runId, safeJoin(workspace.rootDir, "state/events.jsonl"))
  ]);
  const tasksRepo = new LocalTasksRepo(runRoot);
  const artifactsRepo = new LocalArtifactsRepo(runRoot);
  const agentActionsRepo = new LocalAgentActionsRepo(runRoot);
  const contextPackagesRepo = new LocalContextPackagesRepo(runRoot);
  const messagesRepo = new LocalMessagesRepo(runRoot);
  const artifacts = await artifactsRepo.listArtifactsByRun();
  const artifactStore = new FileArtifactStore(workspace, artifacts);
  const domainPack = options.domainPack ?? softwareFreelancePack;
  const domainSpec = await loadPersistedDomainSpec(runRoot, domainPack, existingRun.userGoal);
  const domainInference = await loadPersistedDomainInference(runRoot, domainPack, existingRun.userGoal, domainSpec);
  const steps = options.agentSteps ?? defaultAgentSteps;
  const existingTasks = await tasksRepo.listTasksByRun();
  if (existingTasks.length === 0) {
    await tasksRepo.saveTasks(compileAgentStepsToTasks(options.runId, steps));
  }

  for (const task of await tasksRepo.listTasksByRun()) {
    if (task.status === "waiting_for_approval") {
      await tasksRepo.updateTaskStatus(task.id, "ready");
    }
  }
  await runsRepo.updateRunStatus("running");

  const decisions: Decision[] = [
    {
      id: "domain-spec",
      runId: options.runId,
      madeAt: new Date().toISOString(),
      madeBy: "system",
      title: "Domain inference",
      rationale: `Inferred ${domainSpec.domain} from the persisted user goal and selected ${domainSpec.primaryEntity.name} as the primary workflow entity.`,
      selectedOption: domainSpec.appName
    },
    {
      id: "model-provider",
      runId: options.runId,
      madeAt: new Date().toISOString(),
      madeBy: "system",
      title: "Model provider selection",
      rationale: "Resumed an existing local run with the configured model provider.",
      selectedOption: options.modelProvider.mode
    }
  ];
  const agentActions = await agentActionsRepo.listActionsByRun();
  const agentMessages = await messagesRepo.listMessagesByRun();
  const contextPackages = await contextPackagesRepo.listContextPackagesByRun();
  const artifactsByType = Object.fromEntries(artifacts.map((artifact) => [artifact.type, artifact])) as Partial<Record<ArtifactType, Artifact>>;
  const runtime: OrchestratorRuntime = {
    runId: options.runId,
    safeGoal: existingRun.userGoal,
    modelProvider: options.modelProvider,
    domainPack,
    domainSpec,
    domainInference,
    workspace,
    workspaceDriver: driver,
    artifactStore,
    eventStore,
    runsRepo,
    tasksRepo,
    artifactsRepo,
    agentActionsRepo,
    contextPackagesRepo,
    messagesRepo,
    approvalsRepo,
    artifactsByType,
    agentActions,
    agentMessages,
    contextPackages,
    decisions,
    steps,
    validateFinalPackage: options.validateFinalPackage ?? defaultValidateFinalPackage,
    allowCommands: options.allowCommands ?? false,
    enableRepairLoop: options.enableRepairLoop ?? false
  };

  const taskRun: TaskRun = {
    id: options.runId,
    goal: existingRun.userGoal,
    startedAt: existingRun.createdAt,
    status: "RUNNING",
    modelMode: options.modelProvider.mode,
    outputDir: workspace.rootDir
  };

  await eventStore.append({
    level: "info",
    name: "run.resumed",
    message: `Resumed Agentsim run ${options.runId}.`
  });

  try {
    await runSchedulerLoop(runtime);
    return completeRun(runtime, taskRun);
  } catch (error) {
    if (error instanceof RunWaitingForApprovalError) {
      taskRun.status = "WAITING_HUMAN_APPROVAL";
      return {
        taskRun,
        finalPackageDir: workspace.finalPackageDir,
        artifacts: artifactStore.list(),
        decisions,
        domainSpec
      };
    }
    taskRun.status = "FAILED";
    taskRun.failureReason = "UNKNOWN";
    taskRun.completedAt = new Date().toISOString();
    throw error;
  }
}

async function completeRun(runtime: OrchestratorRuntime, taskRun: TaskRun): Promise<RunDemoResult> {
  await exportFinalPackageArtifacts(runtime);
  await writeTraceFiles(runtime);
  const validationResult = await runtime.validateFinalPackage({
    finalPackageDir: runtime.workspace.finalPackageDir,
    artifacts: runtime.artifactStore.list(),
    domainPack: runtime.domainPack
  });
  const reviewResult = reviewResultFromValidation(validationResult);

  if (reviewResult.verdict === "revise" && runtime.enableRepairLoop) {
    const reviewTask = (await runtime.tasksRepo.listTasksByRun()).find((task) => task.kind === "review") ?? (await runtime.tasksRepo.listTasksByRun()).at(-1);
    if (reviewTask) {
      const fixTask = createFixTask({
        runId: runtime.runId,
        reviewTask,
        reviewResult,
        reviewCycle: reviewTask.reviewCycle ?? 1
      });
      await runtime.tasksRepo.createTask(fixTask);
      await runtime.eventStore.append({
        level: "warn",
        name: "review.fix_task_created",
        taskId: fixTask.id,
        message: "Created a bounded fix task from validation review.",
        data: { requiredFixes: reviewResult.requiredFixes }
      });
    }
    await failRun(runtime, "REPAIR_NOT_IMPLEMENTED", "Repair loop created a fix task, but fix task execution is not implemented yet.", { reviewResult });
    throw new Error("Repair loop created a fix task, but fix task execution is not implemented yet.");
  }

  if (!validationResult.ok) {
    taskRun.status = "REVIEW_FAILED";
    taskRun.failureReason = "VALIDATION_FAILED";
    taskRun.completedAt = new Date().toISOString();
    await writeRunSummary({
      runId: runtime.runId,
      goal: runtime.safeGoal,
      status: taskRun.status,
      modelMode: taskRun.modelMode,
      provider: runtime.modelProvider.name,
      finalPackageDir: runtime.workspace.finalPackageDir,
      artifactCount: runtime.artifactStore.list().length,
      validationResult,
      failures: validationResult.failures
    }, runtime.workspace.finalPackageDir);
    if (reviewResult.verdict === "revise") {
      await runtime.eventStore.append({
        level: "warn",
        name: "review.repair_loop_disabled",
        message: "Validation produced recoverable review failures, but repair loop is disabled.",
        data: { reviewResult }
      });
    }
    await failRun(runtime, "VALIDATION_FAILED", reviewResult.summary, { failures: validationResult.failures, reviewResult });
    throw new Error(`Final package validation failed: ${validationResult.failures.join("; ")}`);
  }

  taskRun.status = "COMPLETED";
  taskRun.completedAt = new Date().toISOString();
  await runtime.runsRepo.updateRunStatus("completed");
  await writeRunSummary({
    runId: runtime.runId,
    goal: runtime.safeGoal,
    status: taskRun.status,
    modelMode: taskRun.modelMode,
    provider: runtime.modelProvider.name,
    finalPackageDir: runtime.workspace.finalPackageDir,
    artifactCount: runtime.artifactStore.list().length,
    validationResult,
    failures: []
  }, runtime.workspace.finalPackageDir);
  await runtime.eventStore.append({
    level: "info",
    name: "run.completed",
    agentId: "delivery",
    artifactId: runtime.artifactsByType["handoff-notes"]?.id,
    message: "Completed Agentsim demo run.",
    data: { finalPackageDir: runtime.workspace.finalPackageDir }
  });

  return {
    taskRun,
    finalPackageDir: runtime.workspace.finalPackageDir,
    artifacts: runtime.artifactStore.list(),
    decisions: runtime.decisions,
    domainSpec: runtime.domainSpec
  };
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

  const contextPackage = await assembleContextPackage({
    runId: runtime.runId,
    goal: runtime.safeGoal,
    task,
    step,
    domainSpec: runtime.domainSpec,
    artifactsByType: runtime.artifactsByType,
    messages: currentMessages,
    decisions: runtime.decisions,
    approvals: await runtime.approvalsRepo.listApprovalsByRun(),
    policy: step.contextPolicy
  });
  const contextValidation = validateContextPackage(contextPackage);
  if (!contextValidation.ok) {
    await runtime.eventStore.append({
      level: "error",
      name: "context.validation_failed",
      agentId: step.ownerAgentId,
      taskId: task.id,
      message: `Context package validation failed for ${task.id}.`,
      data: { failures: contextValidation.failures }
    });
    return { status: "failed", error: `Context package validation failed: ${contextValidation.failures.join("; ")}` };
  }
  await runtime.contextPackagesRepo.createContextPackage(contextPackage);
  runtime.contextPackages.push(contextPackage);

  const context: AgentContext = {
    runId: runtime.runId,
    goal: runtime.safeGoal,
    domainSpec: runtime.domainSpec,
    modelProvider: runtime.modelProvider,
    workspace: runtime.workspace,
    workspaceDriver: runtime.workspaceDriver,
    artifactsByType: runtime.artifactsByType,
    contextPackage,
    tools: createToolRuntime({
      runId: runtime.runId,
      workspace: runtime.workspace,
      workspaceDriver: runtime.workspaceDriver,
      eventStore: runtime.eventStore,
      artifactStore: runtime.artifactStore,
      artifactsRepo: runtime.artifactsRepo,
      approvalsRepo: runtime.approvalsRepo,
      modelMode: runtime.modelProvider.mode,
      allowCommands: runtime.allowCommands,
      hasApproval: (action) => hasApprovedAction(action, runtime.approvalsRepo),
      requestApproval: (approval) => requestToolApproval(runtime.runId, runtime.approvalsRepo, { ...approval, taskId: approval.taskId ?? task.id })
    }),
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
      reviewRequired: step.reviewRequired,
      contextPackageId: contextPackage.id,
      contextHash: contextPackage.contextHash
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
    contextPackageId: contextPackage.id,
    contextHash: contextPackage.contextHash,
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
      contextPackageId: contextPackage.id,
      contextHash: contextPackage.contextHash,
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
        contextPackageId: contextPackage.id,
        contextHash: contextPackage.contextHash,
        summary: stepResult.actionSummary
      }
    });

    return { status: "completed", artifact, actionRecord, messages: currentMessages };
  } catch (error) {
    if (error instanceof ToolApprovalRequiredError) {
      const existing = (await runtime.approvalsRepo.listApprovalsByRun())
        .find((approval) => approval.action === error.action && approval.status === "pending");
      const approval = existing ?? await runtime.approvalsRepo.createApproval({
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
    await runtime.agentActionsRepo.createAction(result.actionRecord);
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
    await runtime.tasksRepo.updateTaskStatus(taskId, "failed", message);
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
  return safeJoin(resolve(outputRoot), runId);
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
  await writeFile(safeJoin(runtime.workspace.rootDir, "state/domain-spec.json"), JSON.stringify(runtime.domainSpec, null, 2), "utf8");
  await writeFile(safeJoin(runtime.workspace.rootDir, "state/domain-inference.json"), JSON.stringify(traceDomainInference(runtime.domainInference), null, 2), "utf8");
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
      primaryEntity: runtime.domainSpec.primaryEntity.name,
      matchedPresetId: runtime.domainInference.matchedPresetId,
      confidence: runtime.domainInference.confidence,
      needsClarification: runtime.domainInference.needsClarification,
      fallbackUsed: runtime.domainInference.fallbackUsed
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
  const traceApprovals = mergeApprovalsById(await runtime.approvalsRepo.listApprovalsByRun());

  await writeFile(safeJoin(runtime.workspace.finalPackageDir, "trace/domain-spec.json"), JSON.stringify(runtime.domainSpec, null, 2), "utf8");
  await writeFile(safeJoin(runtime.workspace.finalPackageDir, "trace/domain-inference.json"), JSON.stringify(traceDomainInference(runtime.domainInference), null, 2), "utf8");
  await writeFile(safeJoin(runtime.workspace.finalPackageDir, "trace/decisions.json"), JSON.stringify({ decisions: runtime.decisions }, null, 2), "utf8");
  await writeFile(safeJoin(runtime.workspace.finalPackageDir, "trace/approvals.json"), JSON.stringify({ approvals: traceApprovals }, null, 2), "utf8");
  await writeFile(safeJoin(runtime.workspace.finalPackageDir, "trace/agent-messages.json"), JSON.stringify({ messages: runtime.agentMessages }, null, 2), "utf8");
  await writeFile(safeJoin(runtime.workspace.finalPackageDir, "trace/agent-actions.json"), JSON.stringify({ actions: runtime.agentActions }, null, 2), "utf8");
  await writeFile(safeJoin(runtime.workspace.finalPackageDir, "trace/context-packages.json"), JSON.stringify({ contextPackages: runtime.contextPackages }, null, 2), "utf8");
  await writeFile(safeJoin(runtime.workspace.finalPackageDir, "trace/context-eval.json"), JSON.stringify({
    evaluation: evaluateContextPackages({
      runId: runtime.runId,
      packages: runtime.contextPackages,
      actions: runtime.agentActions,
      artifacts: runtime.artifactStore.list()
    })
  }, null, 2), "utf8");
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
  contextPackageId?: string;
  contextHash?: string;
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
    contextPackageId: input.contextPackageId,
    contextHash: input.contextHash,
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
      inputArtifactIds: input.inputArtifactIds ?? [],
      contextPackageId: input.contextPackageId,
      contextHash: input.contextHash
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

async function assertRunExists(runRoot: string, runId: string): Promise<void> {
  try {
    await stat(safeJoin(runRoot, "state/run.json"));
  } catch {
    throw new Error(`Run ${runId} does not exist or is missing persisted state.`);
  }
}

async function loadPersistedDomainSpec(runRoot: string, domainPack: DomainPack, goal: string): Promise<DomainSpec> {
  try {
    return JSON.parse(await readFile(safeJoin(runRoot, "state/domain-spec.json"), "utf8")) as DomainSpec;
  } catch {
    return domainPack.inferDomainSpec(goal);
  }
}

async function loadPersistedDomainInference(runRoot: string, domainPack: DomainPack, goal: string, domainSpec: DomainSpec): Promise<DomainInferenceResult> {
  try {
    const persisted = JSON.parse(await readFile(safeJoin(runRoot, "state/domain-inference.json"), "utf8")) as Omit<DomainInferenceResult, "spec">;
    return { ...persisted, spec: domainSpec };
  } catch {
    return { ...inferWithMetadata(domainPack, goal), spec: domainSpec };
  }
}

function inferWithMetadata(domainPack: DomainPack, goal: string): DomainInferenceResult {
  if (domainPack.inferDomainSpecResult) {
    return domainPack.inferDomainSpecResult(goal);
  }
  const spec = domainPack.inferDomainSpec(goal);
  return {
    spec,
    confidence: 0.5,
    matchedPresetId: "unknown",
    matchedKeywords: [],
    warnings: ["Domain pack does not expose inference metadata."],
    needsClarification: false,
    fallbackUsed: false
  };
}

function traceDomainInference(result: DomainInferenceResult): Omit<DomainInferenceResult, "spec"> {
  return {
    matchedPresetId: result.matchedPresetId,
    confidence: result.confidence,
    matchedKeywords: result.matchedKeywords,
    warnings: result.warnings,
    needsClarification: result.needsClarification,
    fallbackUsed: result.fallbackUsed
  };
}

function mergeApprovalsById(approvals: Approval[]): Approval[] {
  return [...new Map(approvals.map((approval) => [approval.id, approval])).values()];
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
