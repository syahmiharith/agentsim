import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type {
  AgentActionRecord,
  AgentMessageRecord,
  AgentStep,
  Approval,
  Artifact,
  ArtifactType,
  ContextEvaluation,
  ContextItem,
  ContextItemKind,
  ContextPackage,
  ContextPolicy,
  Decision,
  Task,
  ValidationResult
} from "../types.js";
import type { DomainSpec } from "../domain/domain-spec.js";
import { sha256 } from "./hash.js";
import { redactSecrets } from "./redact.js";

export interface AssembleContextPackageInput {
  runId: string;
  goal: string;
  task: Task;
  step: AgentStep;
  domainSpec: DomainSpec;
  artifactsByType: Partial<Record<ArtifactType, Artifact>>;
  messages: AgentMessageRecord[];
  decisions: Decision[];
  approvals: Approval[];
  policy?: ContextPolicy;
}

export interface RenderModelPromptOptions {
  fallbackContent: string;
  outputType: ArtifactType;
  reviewRequired: boolean;
}

export function defaultContextPolicyForStep(step: AgentStep): ContextPolicy {
  const requiredKinds: ContextItemKind[] = ["user_goal", "task"];
  if (step.requiredInputs.length > 0) {
    requiredKinds.push("artifact");
  }
  return {
    requiredKinds,
    allowedArtifactTypes: [...step.requiredInputs],
    maxCharsPerItem: 1800,
    maxTotalChars: 12000,
    includeDomainSpec: true,
    includeMessages: true,
    includeDecisions: true,
    includeApprovals: true,
    allowedTools: []
  };
}

export async function assembleContextPackage(input: AssembleContextPackageInput): Promise<ContextPackage> {
  const policy = input.policy ?? input.step.contextPolicy ?? defaultContextPolicyForStep(input.step);
  const createdAt = new Date().toISOString();
  const items: ContextItem[] = [];

  items.push(createContextItem({
    runId: input.runId,
    kind: "user_goal",
    source: "user.goal",
    sourceId: input.runId,
    content: input.goal,
    createdAt,
    policy
  }));

  items.push(createContextItem({
    runId: input.runId,
    kind: "task",
    source: `task:${input.task.id}`,
    sourceId: input.task.id,
    content: [
      `Title: ${input.task.title}`,
      `Description: ${input.task.description}`,
      `Agent: ${input.task.assignedAgentId}`,
      `Action: ${input.step.action}`,
      `Output artifact type: ${input.step.outputType}`,
      `Review required: ${String(input.step.reviewRequired)}`
    ].join("\n"),
    createdAt,
    policy
  }));

  if (policy.includeDomainSpec) {
    items.push(createContextItem({
      runId: input.runId,
      kind: "domain_spec",
      source: "domain.spec",
      sourceId: input.runId,
      content: JSON.stringify(input.domainSpec, null, 2),
      createdAt,
      policy
    }));
  }

  for (const type of input.step.requiredInputs) {
    if (!policy.allowedArtifactTypes.includes(type)) {
      continue;
    }
    const artifact = input.artifactsByType[type];
    if (!artifact) {
      continue;
    }
    const artifactContent = await readFile(artifact.workspacePath, "utf8");
    items.push(createContextItem({
      runId: input.runId,
      kind: "artifact",
      source: `artifact:${type}:${artifact.finalPackagePath}`,
      sourceId: artifact.id,
      content: [
        `Artifact type: ${type}`,
        `Owner: ${artifact.ownerAgentId}`,
        `Status: ${artifact.status}`,
        `Review status: ${artifact.reviewStatus}`,
        `Approval status: ${artifact.approvalStatus}`,
        "",
        artifactContent
      ].join("\n"),
      createdAt,
      policy
    }));
  }

  if (policy.includeMessages) {
    for (const message of input.messages) {
      items.push(createContextItem({
        runId: input.runId,
        kind: "message",
        source: `message:${message.type}:${message.from}->${message.to}`,
        sourceId: message.id,
        content: [
          `Question: ${message.question}`,
          `Expected output: ${message.expectedOutput}`,
          message.artifactType ? `Artifact type: ${message.artifactType}` : undefined
        ].filter(Boolean).join("\n"),
        createdAt,
        policy
      }));
    }
  }

  if (policy.includeDecisions) {
    for (const decision of input.decisions) {
      items.push(createContextItem({
        runId: input.runId,
        kind: "decision",
        source: `decision:${decision.title}`,
        sourceId: decision.id,
        content: [
          `Selected option: ${decision.selectedOption}`,
          `Rationale: ${decision.rationale}`
        ].join("\n"),
        createdAt,
        policy
      }));
    }
  }

  if (policy.includeApprovals) {
    for (const approval of input.approvals.filter((approval) => approval.taskId === input.task.id || approval.artifactId)) {
      items.push(createContextItem({
        runId: input.runId,
        kind: "approval",
        source: `approval:${approval.action ?? approval.artifactId ?? approval.id}`,
        sourceId: approval.id,
        content: [
          `Status: ${approval.status}`,
          `Risk: ${approval.riskLevel ?? "low"}`,
          `Notes: ${approval.notes}`
        ].join("\n"),
        createdAt,
        policy
      }));
    }
  }

  const inputArtifactIds = input.step.requiredInputs
    .map((type) => input.artifactsByType[type]?.id)
    .filter((id): id is string => typeof id === "string");
  const messageIds = input.messages.map((message) => message.id);
  const packageWithoutHash: Omit<ContextPackage, "contextHash"> = {
    id: `ctx-${input.task.id}-${randomUUID()}`,
    runId: input.runId,
    taskId: input.task.id,
    agentId: input.step.ownerAgentId,
    stepId: input.step.id,
    goal: redactSecrets(input.goal),
    objective: redactSecrets(input.step.action),
    inputArtifactIds,
    messageIds,
    itemIds: items.map((item) => item.id),
    items,
    policy,
    createdAt
  };

  return {
    ...packageWithoutHash,
    contextHash: hashContextPackage(packageWithoutHash)
  };
}

export function validateContextPackage(pkg: ContextPackage): ValidationResult {
  const failures: string[] = [];
  const itemIds = new Set<string>();
  const presentKinds = new Set(pkg.items.map((item) => item.kind));
  const artifactItemSourceIds = new Set(pkg.items.filter((item) => item.kind === "artifact").map((item) => item.sourceId).filter(Boolean));
  const totalChars = pkg.items.reduce((sum, item) => sum + item.content.length, 0);

  for (const kind of pkg.policy.requiredKinds) {
    if (!presentKinds.has(kind)) {
      failures.push(`Context package ${pkg.id} is missing required kind ${kind}`);
    }
  }

  if (totalChars > pkg.policy.maxTotalChars) {
    failures.push(`Context package ${pkg.id} exceeds maxTotalChars`);
  }

  for (const inputArtifactId of pkg.inputArtifactIds) {
    if (!artifactItemSourceIds.has(inputArtifactId)) {
      failures.push(`Context package ${pkg.id} is missing input artifact ${inputArtifactId}`);
    }
  }

  for (const item of pkg.items) {
    if (itemIds.has(item.id)) {
      failures.push(`Duplicate context item id: ${item.id}`);
    }
    itemIds.add(item.id);
    if (item.runId !== pkg.runId) {
      failures.push(`Context item ${item.id} runId does not match package`);
    }
    if (item.content.length > pkg.policy.maxCharsPerItem) {
      failures.push(`Context item ${item.id} exceeds maxCharsPerItem`);
    }
    if (sha256(item.content) !== item.contentHash) {
      failures.push(`Context item ${item.id} contentHash does not match content`);
    }
    if (item.kind === "artifact") {
      const artifactType = artifactTypeFromSource(item.source);
      if (!artifactType || !pkg.policy.allowedArtifactTypes.includes(artifactType)) {
        failures.push(`Context item ${item.id} includes disallowed artifact source ${item.source}`);
      }
    }
  }

  for (const itemId of pkg.itemIds) {
    if (!itemIds.has(itemId)) {
      failures.push(`Context package ${pkg.id} references missing item ${itemId}`);
    }
  }

  if (hashContextPackage(pkg) !== pkg.contextHash) {
    failures.push(`Context package ${pkg.id} contextHash does not match content`);
  }

  return { ok: failures.length === 0, failures };
}

export function renderModelPrompt(pkg: ContextPackage, options: RenderModelPromptOptions): string {
  return [
    `Client goal: ${pkg.goal}`,
    `Context package: ${pkg.id}`,
    `Context hash: ${pkg.contextHash}`,
    `Task: ${pkg.taskId}`,
    `Step: ${pkg.stepId}`,
    `Objective: ${pkg.objective}`,
    `Output artifact type: ${options.outputType}`,
    `Review required: ${String(options.reviewRequired)}`,
    "Context items:",
    ...pkg.items.map((item) => [
      `## ${item.kind} | ${item.source}`,
      `id: ${item.id}`,
      item.sourceId ? `sourceId: ${item.sourceId}` : undefined,
      `hash: ${item.contentHash}`,
      item.content
    ].filter(Boolean).join("\n")),
    "Use this deterministic scaffold as the minimum expected coverage. Rewrite it with useful, specific project content while preserving the artifact's purpose:",
    options.fallbackContent
  ].join("\n\n");
}

export function evaluateContextPackages(input: {
  runId: string;
  packages: ContextPackage[];
  actions: AgentActionRecord[];
  artifacts: Artifact[];
}): ContextEvaluation {
  const failures: string[] = [];
  const packagesById = new Map(input.packages.map((pkg) => [pkg.id, pkg]));
  const artifactsById = new Map(input.artifacts.map((artifact) => [artifact.id, artifact]));
  let requiredCoverageOk = true;
  let provenanceOk = true;

  for (const pkg of input.packages) {
    const validation = validateContextPackage(pkg);
    if (!validation.ok) {
      requiredCoverageOk = false;
      failures.push(...validation.failures);
    }
  }

  for (const action of input.actions.filter((action) => action.status === "completed")) {
    const pkg = action.contextPackageId ? packagesById.get(action.contextPackageId) : undefined;
    if (!pkg) {
      provenanceOk = false;
      failures.push(`Agent action ${action.stepId} is missing context package`);
      continue;
    }
    if (action.contextHash !== pkg.contextHash) {
      provenanceOk = false;
      failures.push(`Agent action ${action.stepId} contextHash does not match stored package`);
    }
    for (const inputArtifactId of action.inputArtifactIds) {
      if (!pkg.inputArtifactIds.includes(inputArtifactId)) {
        provenanceOk = false;
        failures.push(`Agent action ${action.stepId} input artifact ${inputArtifactId} is missing from context package`);
      }
    }
    const outputArtifact = action.outputArtifactId ? artifactsById.get(action.outputArtifactId) : undefined;
    if (outputArtifact && (
      outputArtifact.lineage.contextPackageId !== pkg.id ||
      outputArtifact.lineage.contextHash !== pkg.contextHash
    )) {
      provenanceOk = false;
      failures.push(`Artifact ${outputArtifact.type} lineage context does not match producing action`);
    }
  }

  return {
    runId: input.runId,
    generatedAt: new Date().toISOString(),
    packageCount: input.packages.length,
    actionCount: input.actions.filter((action) => action.status === "completed").length,
    artifactCount: input.artifacts.length,
    totalItemCount: input.packages.reduce((sum, pkg) => sum + pkg.items.length, 0),
    totalChars: input.packages.reduce((sum, pkg) => sum + pkg.items.reduce((itemSum, item) => itemSum + item.content.length, 0), 0),
    requiredCoverageOk,
    provenanceOk,
    failures
  };
}

function createContextItem(input: {
  runId: string;
  kind: ContextItemKind;
  source: string;
  sourceId?: string;
  content: string;
  createdAt: string;
  policy: ContextPolicy;
}): ContextItem {
  const redacted = redactSecrets(input.content);
  const content = truncate(redacted, input.policy.maxCharsPerItem);
  return {
    id: `${input.kind}-${input.sourceId ?? sha256(input.source).slice(0, 12)}`,
    runId: input.runId,
    kind: input.kind,
    source: input.source,
    sourceId: input.sourceId,
    content,
    contentHash: sha256(content),
    createdAt: input.createdAt,
    sensitivity: redacted === input.content ? "internal" : "secret-redacted"
  };
}

function hashContextPackage(pkg: Omit<ContextPackage, "contextHash"> | ContextPackage): string {
  return sha256(canonicalStringify({
    runId: pkg.runId,
    taskId: pkg.taskId,
    agentId: pkg.agentId,
    stepId: pkg.stepId,
    goal: pkg.goal,
    objective: pkg.objective,
    inputArtifactIds: [...pkg.inputArtifactIds].sort(),
    messageIds: [...pkg.messageIds].sort(),
    itemIds: [...pkg.itemIds].sort(),
    itemHashes: pkg.items.map((item) => ({ id: item.id, kind: item.kind, source: item.source, sourceId: item.sourceId, contentHash: item.contentHash })).sort((left, right) => left.id.localeCompare(right.id)),
    policy: pkg.policy
  }));
}

function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, sortValue(item)]));
  }
  return value;
}

function artifactTypeFromSource(source: string): ArtifactType | undefined {
  const [, type] = source.split(":");
  return type as ArtifactType | undefined;
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxLength - 16))}\n... [truncated]`;
}
