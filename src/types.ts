import type { DomainSpec } from "./domain/domain-spec.js";
import type { DomainInferenceResult } from "./domain/domain-inference.js";

export type ArtifactStatus = "draft" | "reviewed" | "approved" | "rejected" | "superseded" | "exported" | "failed";
export type ReviewStatus = "not_required" | "pending" | "passed" | "failed";
export type ApprovalStatus = "not_required" | "pending" | "approved" | "rejected";
export type EventLevel = "info" | "warn" | "error";
export type ModelMode = "mock" | "live";
export type AgentActionStatus = "started" | "completed" | "failed";
export type AgentOutputSource = "template" | "model";
export type AgentMessageSender = AgentRole | "orchestrator";
export type AgentMessageType = "task.assignment" | "artifact.handoff" | "review.request";
export type RunStatus = "created" | "planning" | "running" | "reviewing" | "blocked" | "waiting_for_approval" | "completed" | "failed" | "cancelled";
export type TaskStatus = "pending" | "ready" | "running" | "blocked" | "needs_review" | "waiting_for_approval" | "completed" | "failed" | "cancelled";
export type TaskKind = "artifact_generation" | "app_generation" | "review" | "fix" | "approval" | "delivery";
export type ToolRiskLevel = "safe" | "medium" | "dangerous";
export type ApprovalRiskLevel = "low" | "medium" | "high";
export type ReviewVerdict = "pass" | "revise" | "fail";
export type ContextItemKind =
  | "user_goal"
  | "domain_spec"
  | "task"
  | "artifact"
  | "message"
  | "decision"
  | "approval"
  | "test_result"
  | "policy";
export type ContextSensitivity = "public" | "internal" | "secret-redacted";

export type TaskRunStatus =
  | "PENDING"
  | "RUNNING"
  | "PRODUCED_ARTIFACT"
  | "NEEDS_REVIEW"
  | "REVIEW_PASSED"
  | "REVIEW_FAILED"
  | "WAITING_HUMAN_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type FailureReason =
  | "FAILED_MODEL_CALL"
  | "FAILED_TOOL_CALL"
  | "FAILED_REVIEW"
  | "TIMEOUT"
  | "BUDGET_EXCEEDED"
  | "VALIDATION_FAILED"
  | "UNKNOWN";

export type AgentRole =
  | "client-intake"
  | "scope-pm"
  | "software-architect"
  | "builder"
  | "reviewer-qa"
  | "delivery";

export type ArtifactType =
  | "proposal"
  | "project-summary"
  | "requirements"
  | "scope"
  | "assumptions"
  | "timeline"
  | "risks"
  | "architecture"
  | "database-schema"
  | "api-plan"
  | "task-breakdown"
  | "app"
  | "qa-report"
  | "code-review"
  | "known-issues"
  | "handoff-guide"
  | "handoff-notes"
  | "user-guide";

export interface Agent {
  id: AgentRole;
  displayName: string;
  mission: string;
}

export interface AgentActionRecord {
  id: string;
  runId: string;
  stepId: string;
  agentId: AgentRole;
  action: string;
  outputType: ArtifactType;
  inputMessageIds: string[];
  inputArtifactIds: string[];
  contextPackageId?: string;
  contextHash?: string;
  outputArtifactId?: string;
  status: AgentActionStatus;
  modelMode: ModelMode;
  provider: string;
  model?: string;
  outputSource?: AgentOutputSource;
  reviewRequired: boolean;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface AgentMessageRecord {
  id: string;
  runId: string;
  type: AgentMessageType;
  from: AgentMessageSender;
  to: AgentRole;
  stepId: string;
  artifactId?: string;
  artifactType?: ArtifactType;
  question: string;
  expectedOutput: string;
  createdAt: string;
}

export interface TaskRun {
  id: string;
  goal: string;
  startedAt: string;
  completedAt?: string;
  status: TaskRunStatus;
  failureReason?: FailureReason;
  modelMode: ModelMode;
  outputDir: string;
}

export interface Run {
  id: string;
  userGoal: string;
  status: RunStatus;
  modelMode: ModelMode;
  outputRoot: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  failureReason?: string;
}

export interface Task {
  id: string;
  runId: string;
  title: string;
  description: string;
  kind: TaskKind;
  assignedAgentId: AgentRole;
  status: TaskStatus;
  dependsOn: string[];
  requiredArtifactTypes: ArtifactType[];
  outputArtifactType?: ArtifactType;
  attempts: number;
  maxAttempts: number;
  reviewCycle?: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  failureReason?: string;
}

export interface Organization {
  id: string;
  name: string;
}

export interface Project {
  id: string;
  organizationId: string;
  name: string;
  goal: string;
  domainPackId: string;
  createdAt: string;
}

export interface Workspace {
  runId: string;
  rootDir: string;
  workspaceDir: string;
  finalPackageDir: string;
}

export interface ArtifactLineage {
  inputArtifactIds: string[];
  promptHash?: string;
  contextPackageId?: string;
  contextHash?: string;
}

export interface Artifact {
  id: string;
  type: ArtifactType;
  ownerAgentId: AgentRole;
  status: ArtifactStatus;
  workspacePath: string;
  finalPackagePath: string;
  lineage: ArtifactLineage;
  createdAt: string;
  updatedAt: string;
  reviewStatus: ReviewStatus;
  approvalStatus: ApprovalStatus;
  contentHash: string;
}

export interface Decision {
  id: string;
  runId: string;
  madeAt: string;
  madeBy: "system" | "human";
  title: string;
  rationale: string;
  selectedOption: string;
}

export interface Approval {
  id: string;
  runId: string;
  artifactId?: string;
  taskId?: string;
  requestedBy?: string;
  action?: string;
  riskLevel?: ApprovalRiskLevel;
  requestedAt: string;
  createdAt?: string;
  resolvedAt?: string;
  status: ApprovalStatus;
  approver?: "auto" | "human";
  notes: string;
}

export interface ContextItem {
  id: string;
  runId: string;
  kind: ContextItemKind;
  source: string;
  sourceId?: string;
  content: string;
  contentHash: string;
  createdAt: string;
  sensitivity: ContextSensitivity;
}

export interface ContextPolicy {
  requiredKinds: ContextItemKind[];
  allowedArtifactTypes: ArtifactType[];
  maxCharsPerItem: number;
  maxTotalChars: number;
  includeDomainSpec: boolean;
  includeMessages: boolean;
  includeDecisions: boolean;
  includeApprovals: boolean;
  allowedTools: string[];
}

export interface ContextPackage {
  id: string;
  runId: string;
  taskId: string;
  agentId: AgentRole;
  stepId: string;
  goal: string;
  objective: string;
  inputArtifactIds: string[];
  messageIds: string[];
  itemIds: string[];
  items: ContextItem[];
  policy: ContextPolicy;
  contextHash: string;
  createdAt: string;
}

export interface ContextEvaluation {
  runId: string;
  generatedAt: string;
  packageCount: number;
  actionCount: number;
  artifactCount: number;
  totalItemCount: number;
  totalChars: number;
  requiredCoverageOk: boolean;
  provenanceOk: boolean;
  failures: string[];
}

export interface Event {
  id: string;
  runId: string;
  timestamp: string;
  level: EventLevel;
  name: string;
  agentId?: AgentRole;
  artifactId?: string;
  taskId?: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface ModelRequest {
  system: string;
  prompt: string;
  purpose: string;
}

export interface ModelResponse {
  content: string;
  model: string;
}

export interface ModelProvider {
  mode: ModelMode;
  name: string;
  generate(request: ModelRequest): Promise<ModelResponse>;
}

export interface RunCommandResult {
  command: string;
  args?: string[];
  cwd?: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs?: number;
  timedOut?: boolean;
}

export interface RunCommandInput {
  command: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
}

export interface WorkspaceDriver {
  create(runId: string, outputRoot: string): Promise<Workspace>;
  writeFile(workspace: Workspace, relativePath: string, content: string): Promise<string>;
  readFile(workspace: Workspace, relativePath: string): Promise<string>;
  listFiles(workspace: Workspace, relativePath?: string): Promise<string[]>;
  copyDirectory(sourceDir: string, targetDir: string): Promise<void>;
  runCommand?(workspace: Workspace, input: RunCommandInput): Promise<RunCommandResult>;
}

export interface ArtifactStore {
  createMarkdown(input: CreateArtifactInput): Promise<Artifact>;
  list(): Artifact[];
  exportLineage(targetPath: string): Promise<void>;
}

export interface EventStore {
  append(event: Omit<Event, "id" | "timestamp" | "runId">): Promise<Event>;
  appendExisting?(event: Event): Promise<Event>;
}

export interface ToolContext {
  runId: string;
  workspace: Workspace;
  workspaceDriver: WorkspaceDriver;
  eventStore?: EventStore;
  artifactStore?: ArtifactStore;
  artifactsRepo?: { createArtifactRecord(artifact: Artifact): Promise<Artifact> };
  approvalsRepo?: { createApproval(input: Omit<Approval, "id" | "requestedAt" | "createdAt" | "status"> & { id?: string; status?: ApprovalStatus }): Promise<Approval>; listApprovalsByRun(): Promise<Approval[]> };
  modelMode: ModelMode;
  allowCommands?: boolean;
  hasApproval?: (action: string) => boolean | Promise<boolean>;
  requestApproval?: (approval: Omit<Approval, "id" | "runId" | "requestedAt" | "createdAt" | "status" | "notes"> & { notes?: string }) => Promise<Approval>;
}

export interface ToolDefinition<Input, Output> {
  name: string;
  description: string;
  riskLevel: ToolRiskLevel;
  requiresApproval: boolean;
  execute(input: Input, context: ToolContext): Promise<Output>;
}

export interface ReviewResult {
  verdict: ReviewVerdict;
  blockingIssues: string[];
  requiredFixes: string[];
  summary: string;
}

export interface ToolRuntime {
  readFile(input: { path: string }): Promise<string>;
  writeFile(input: { path: string; content: string }): Promise<string>;
  listFiles(input: { path?: string }): Promise<string[]>;
  createArtifact(input: CreateArtifactInput): Promise<{ id: string; type: ArtifactType }>;
  runCommand(input: RunCommandInput): Promise<RunCommandResult>;
  askHuman(input: { action: string; taskId?: string; requestedBy: string; notes?: string }): Promise<{ approvalId: string }>;
}

export interface CreateArtifactInput {
  type: ArtifactType;
  ownerAgentId: AgentRole;
  content: string;
  workspaceRelativePath: string;
  finalPackagePath: string;
  inputArtifactIds?: string[];
  contextPackageId?: string;
  contextHash?: string;
  reviewStatus?: ReviewStatus;
  approvalStatus?: ApprovalStatus;
  status?: ArtifactStatus;
  prompt?: string;
}

export interface ArtifactManifestItem {
  type: ArtifactType;
  title: string;
  ownerAgentId: AgentRole;
  finalPackagePath: string;
  required: boolean;
  reviewRequired: boolean;
}

export interface ReviewRubricCriterion {
  id: string;
  label: string;
  description: string;
}

export interface DomainPack {
  id: string;
  displayName: string;
  version: string;
  agents: Agent[];
  artifactManifest: ArtifactManifestItem[];
  requiredFinalPackageFiles: string[];
  requiredTraceFiles: string[];
  reviewRubric: ReviewRubricCriterion[];
  inferDomainSpec(goal: string): DomainSpec;
  inferDomainSpecResult?: (goal: string) => DomainInferenceResult;
}

export interface AgentContext {
  runId: string;
  goal: string;
  domainSpec: DomainSpec;
  modelProvider: ModelProvider;
  workspace: Workspace;
  workspaceDriver: WorkspaceDriver;
  artifactsByType: Partial<Record<ArtifactType, Artifact>>;
  contextPackage?: ContextPackage;
  tools?: ToolRuntime;
  currentMessages?: AgentMessageRecord[];
  appValidation?: { ok: boolean; message: string };
}

export interface AgentStepResult {
  content: string;
  workspaceRelativePath: string;
  finalPackagePath: string;
  status?: ArtifactStatus;
  reviewStatus?: ReviewStatus;
  approvalStatus?: ApprovalStatus;
  outputSource?: AgentOutputSource;
  model?: string;
  actionSummary?: string;
}

export interface AgentStep {
  id: string;
  ownerAgentId: AgentRole;
  action: string;
  outputType: ArtifactType;
  requiredInputs: ArtifactType[];
  reviewRequired: boolean;
  contextPolicy?: ContextPolicy;
  execute(context: AgentContext): Promise<AgentStepResult>;
}

export interface ValidationResult {
  ok: boolean;
  failures: string[];
}

export interface RunSummary {
  runId: string;
  goal: string;
  status: TaskRunStatus;
  modelMode: ModelMode;
  provider: string;
  finalPackageDir: string;
  artifactCount: number;
  validationResult: ValidationResult;
  failures: string[];
}
