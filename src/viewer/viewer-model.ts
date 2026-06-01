import type { AgentRole, ApprovalStatus, ArtifactStatus, ArtifactType, ModelMode, ReviewStatus, RunStatus, TaskStatus } from "../types.js";

export interface RunViewerModel {
  run: {
    id: string;
    goal: string;
    status: RunStatus | string;
    modelMode?: ModelMode | string;
    startedAt?: string;
    completedAt?: string;
    outputDir: string;
    validationSummary?: {
      ok?: boolean;
      failures: string[];
    };
  };
  goal: {
    appName?: string;
    archetype?: string;
    primaryEntity?: string;
    targetUsers: string[];
    deferredFeatures: string[];
    unresolvedQuestions: string[];
  };
  progress: {
    taskCount: number;
    completed: number;
    failed: number;
    waitingForApproval: number;
    tasks: ViewerTask[];
  };
  decisions: ViewerDecision[];
  artifacts: ViewerArtifact[];
  review: {
    qaReport?: ViewerMarkdownFile;
    codeReview?: ViewerMarkdownFile;
    knownIssues?: ViewerMarkdownFile;
    appTestReport?: ViewerMarkdownFile;
    appValidation?: unknown;
  };
  trace: {
    productBrief?: unknown;
    domainSpec?: unknown;
    appSpec?: unknown;
    appValidation?: unknown;
    workflowGraph?: unknown;
    toolRegistry?: unknown;
    eventsPreview: ViewerEvent[];
    commandResultsPreview: ViewerCommandResult[];
  };
  finalPackage: {
    path: string;
    files: ViewerFileNode[];
  };
}

export interface ViewerTask {
  id: string;
  title: string;
  status: TaskStatus | string;
  ownerAgentId: AgentRole | string;
  outputArtifactType?: ArtifactType | string;
  attempts: number;
  startedAt?: string;
  completedAt?: string;
  reviewStatus?: ReviewStatus | string;
  approvalStatus?: ApprovalStatus | string;
}

export interface ViewerDecision {
  id: string;
  title: string;
  selectedOption: string;
  rationale: string;
  madeBy: string;
  madeAt: string;
}

export interface ViewerArtifact {
  id: string;
  type: ArtifactType | string;
  category: "Client" | "Planning" | "Technical" | "App" | "Review" | "Delivery" | "Trace" | "Other";
  ownerAgentId: AgentRole | string;
  status: ArtifactStatus | string;
  reviewStatus: ReviewStatus | string;
  approvalStatus: ApprovalStatus | string;
  finalPackagePath: string;
  previewPath?: string;
}

export interface ViewerMarkdownFile {
  path: string;
  title: string;
  content: string;
}

export interface ViewerEvent {
  timestamp?: string;
  level?: string;
  name?: string;
  message?: string;
  actor?: string;
}

export interface ViewerCommandResult {
  timestamp?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  exitCode?: number;
  durationMs?: number;
  timedOut?: boolean;
  policyLevel?: string;
  deniedReason?: string;
}

export interface ViewerFileNode {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
  children?: ViewerFileNode[];
}
