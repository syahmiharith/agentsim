export type ArtifactStatus = "draft" | "reviewed" | "approved" | "exported" | "failed";
export type ReviewStatus = "not_required" | "pending" | "passed" | "failed";
export type ApprovalStatus = "not_required" | "pending" | "approved" | "rejected";
export type EventLevel = "info" | "warn" | "error";
export type ModelMode = "mock" | "live";

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
  | "handoff-guide";

export interface Agent {
  id: AgentRole;
  displayName: string;
  mission: string;
}

export interface TaskRun {
  id: string;
  goal: string;
  startedAt: string;
  completedAt?: string;
  status: "running" | "completed" | "failed";
  modelMode: ModelMode;
  outputDir: string;
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

export interface WorkspaceDriver {
  create(runId: string, outputRoot: string): Promise<Workspace>;
  writeFile(workspace: Workspace, relativePath: string, content: string): Promise<string>;
  copyDirectory(sourceDir: string, targetDir: string): Promise<void>;
}

export interface ArtifactStore {
  createMarkdown(input: CreateArtifactInput): Promise<Artifact>;
  list(): Artifact[];
  exportLineage(targetPath: string): Promise<void>;
}

export interface EventStore {
  append(event: Omit<Event, "id" | "timestamp">): Promise<Event>;
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

