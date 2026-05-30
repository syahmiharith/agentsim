import type { DomainSpec } from "./domain/domain-spec.js";

export type ArtifactStatus = "draft" | "reviewed" | "approved" | "rejected" | "superseded" | "exported" | "failed";
export type ReviewStatus = "not_required" | "pending" | "passed" | "failed";
export type ApprovalStatus = "not_required" | "pending" | "approved" | "rejected";
export type EventLevel = "info" | "warn" | "error";
export type ModelMode = "mock" | "live";
export type AgentActionStatus = "started" | "completed" | "failed";
export type AgentOutputSource = "template" | "model";
export type AgentMessageSender = AgentRole | "orchestrator";
export type AgentMessageType = "task.assignment" | "artifact.handoff" | "review.request";

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
  artifactId: string;
  requestedAt: string;
  resolvedAt: string;
  status: ApprovalStatus;
  approver: "auto" | "human";
  notes: string;
}

export interface Event {
  id: string;
  runId: string;
  timestamp: string;
  level: EventLevel;
  name: string;
  agentId?: AgentRole;
  artifactId?: string;
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
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface WorkspaceDriver {
  create(runId: string, outputRoot: string): Promise<Workspace>;
  writeFile(workspace: Workspace, relativePath: string, content: string): Promise<string>;
  readFile(workspace: Workspace, relativePath: string): Promise<string>;
  listFiles(workspace: Workspace, relativePath?: string): Promise<string[]>;
  copyDirectory(sourceDir: string, targetDir: string): Promise<void>;
  runCommand?(workspace: Workspace, command: string): Promise<RunCommandResult>;
}

export interface ArtifactStore {
  createMarkdown(input: CreateArtifactInput): Promise<Artifact>;
  list(): Artifact[];
  exportLineage(targetPath: string): Promise<void>;
}

export interface EventStore {
  append(event: Omit<Event, "id" | "timestamp" | "runId">): Promise<Event>;
}

export interface CreateArtifactInput {
  type: ArtifactType;
  ownerAgentId: AgentRole;
  content: string;
  workspaceRelativePath: string;
  finalPackagePath: string;
  inputArtifactIds?: string[];
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
}

export interface AgentContext {
  runId: string;
  goal: string;
  domainSpec: DomainSpec;
  modelProvider: ModelProvider;
  workspace: Workspace;
  workspaceDriver: WorkspaceDriver;
  artifactsByType: Partial<Record<ArtifactType, Artifact>>;
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
