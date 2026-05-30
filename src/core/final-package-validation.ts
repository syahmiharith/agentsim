import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { AgentActionRecord, AgentMessageRecord, Artifact, DomainPack, ValidationResult } from "../types.js";
import { sha256 } from "./hash.js";

const validAgentMessageTypes = new Set(["task.assignment", "artifact.handoff", "review.request"]);

export interface FinalPackageValidationInput {
  finalPackageDir: string;
  artifacts: Artifact[];
  domainPack: DomainPack;
}

export async function validateFinalPackage(input: FinalPackageValidationInput): Promise<ValidationResult> {
  const failures: string[] = [];
  const agentIds = new Set(input.domainPack.agents.map((agent) => agent.id));
  const artifactIds = new Set(input.artifacts.map((artifact) => artifact.id));
  const artifactsById = new Map(input.artifacts.map((artifact) => [artifact.id, artifact]));
  const seenTypes = new Set<string>();
  const duplicateTypes = new Set<string>();
  const seenFinalPackagePaths = new Set<string>();
  const duplicateFinalPackagePaths = new Set<string>();

  for (const manifestItem of input.domainPack.artifactManifest) {
    if (!agentIds.has(manifestItem.ownerAgentId)) {
      failures.push(`Manifest artifact ${manifestItem.type} references unknown owner agent ${manifestItem.ownerAgentId}`);
    }
  }

  for (const artifact of input.artifacts) {
    if (seenTypes.has(artifact.type)) {
      duplicateTypes.add(artifact.type);
    }
    seenTypes.add(artifact.type);

    if (seenFinalPackagePaths.has(artifact.finalPackagePath)) {
      duplicateFinalPackagePaths.add(artifact.finalPackagePath);
    }
    seenFinalPackagePaths.add(artifact.finalPackagePath);
  }

  for (const type of duplicateTypes) {
    failures.push(`Duplicate artifact type: ${type}`);
  }

  for (const finalPackagePath of duplicateFinalPackagePaths) {
    failures.push(`Duplicate final package path: ${finalPackagePath}`);
  }

  for (const relativePath of input.domainPack.requiredFinalPackageFiles) {
    if (!(await pathExists(join(input.finalPackageDir, relativePath)))) {
      failures.push(`Missing required final-package file: ${relativePath}`);
    }
  }

  for (const relativePath of input.domainPack.requiredTraceFiles) {
    if (!(await pathExists(join(input.finalPackageDir, relativePath)))) {
      failures.push(`Missing required trace file: ${relativePath}`);
    }
  }

  for (const manifestItem of input.domainPack.artifactManifest.filter((item) => item.required)) {
    const artifact = input.artifacts.find((candidate) => candidate.type === manifestItem.type);
    if (!artifact) {
      failures.push(`Missing required artifact: ${manifestItem.type}`);
      continue;
    }
    if (artifact.ownerAgentId !== manifestItem.ownerAgentId) {
      failures.push(`Artifact ${artifact.type} is owned by ${artifact.ownerAgentId}, expected ${manifestItem.ownerAgentId}`);
    }
    if (artifact.finalPackagePath !== manifestItem.finalPackagePath) {
      failures.push(`Artifact ${artifact.type} exports to ${artifact.finalPackagePath}, expected ${manifestItem.finalPackagePath}`);
    }
    if (manifestItem.reviewRequired && artifact.reviewStatus !== "passed") {
      failures.push(`Review-required artifact ${artifact.type} must pass review before final completion`);
    }
    if (manifestItem.finalPackagePath !== "app/" && !(await pathExists(join(input.finalPackageDir, manifestItem.finalPackagePath)))) {
      failures.push(`Required artifact ${artifact.type} is missing exported file ${manifestItem.finalPackagePath}`);
    }
  }

  for (const artifact of input.artifacts) {
    if (!artifact.contentHash) {
      failures.push(`Artifact ${artifact.type} is missing contentHash`);
    }
    if (!artifact.ownerAgentId) {
      failures.push(`Artifact ${artifact.type} is missing ownerAgentId`);
    }
    if (!artifact.status) {
      failures.push(`Artifact ${artifact.type} is missing status`);
    }
    if (!artifact.lineage || !Array.isArray(artifact.lineage.inputArtifactIds)) {
      failures.push(`Artifact ${artifact.type} is missing lineage inputArtifactIds`);
    } else {
      for (const inputArtifactId of artifact.lineage.inputArtifactIds) {
        if (!artifactIds.has(inputArtifactId)) {
          failures.push(`Artifact ${artifact.type} references unknown input artifact ${inputArtifactId}`);
        }
      }
    }
    if (!agentIds.has(artifact.ownerAgentId)) {
      failures.push(`Artifact ${artifact.type} is owned by unknown agent ${artifact.ownerAgentId}`);
    }
    if (artifact.approvalStatus === "approved" && artifact.reviewStatus === "pending") {
      failures.push(`Artifact ${artifact.type} cannot be approved while review is pending`);
    }
    if (artifact.approvalStatus === "approved" && artifact.reviewStatus === "failed") {
      failures.push(`Artifact ${artifact.type} cannot be approved after failed review`);
    }
    if (artifact.contentHash) {
      try {
        const content = await readFile(artifact.workspacePath, "utf8");
        const actualHash = sha256(content);
        if (actualHash !== artifact.contentHash) {
          failures.push(`Artifact ${artifact.type} contentHash does not match workspace content`);
        }
      } catch {
        failures.push(`Artifact ${artifact.type} workspace file is missing or unreadable`);
      }
    }
  }

  const reviewerArtifacts = input.artifacts.filter((artifact) => artifact.ownerAgentId === "reviewer-qa");
  for (const requiredType of ["qa-report", "code-review", "known-issues"]) {
    if (!reviewerArtifacts.some((artifact) => artifact.type === requiredType)) {
      failures.push(`Missing reviewer artifact: ${requiredType}`);
    }
  }

  for (const artifact of reviewerArtifacts) {
    if (artifact.reviewStatus !== "passed" && artifact.reviewStatus !== "failed") {
      failures.push(`Reviewer artifact ${artifact.type} must explicitly pass or fail review`);
    }
  }

  const messageIds = await validateAgentMessages(input.finalPackageDir, artifactsById, agentIds, failures);
  await validateAgentActions(input.finalPackageDir, artifactsById, messageIds, failures);

  return {
    ok: failures.length === 0,
    failures
  };
}

async function validateAgentActions(
  finalPackageDir: string,
  artifactsById: Map<string, Artifact>,
  messageIds: Set<string>,
  failures: string[]
): Promise<void> {
  const actionPath = join(finalPackageDir, "trace", "agent-actions.json");
  if (!(await pathExists(actionPath))) {
    return;
  }

  let actions: AgentActionRecord[];
  try {
    const parsed = JSON.parse(await readFile(actionPath, "utf8")) as { actions?: AgentActionRecord[] };
    actions = parsed.actions ?? [];
  } catch {
    failures.push("Agent action trace is not valid JSON");
    return;
  }

  const actionsByOutputArtifact = new Map<string, AgentActionRecord>();
  for (const action of actions) {
    if (action.status !== "completed") {
      failures.push(`Agent action ${action.stepId} did not complete`);
    }
    if (!Array.isArray(action.inputMessageIds) || action.inputMessageIds.length === 0) {
      failures.push(`Agent action ${action.stepId} is missing inputMessageIds`);
    }
    for (const messageId of action.inputMessageIds ?? []) {
      if (!messageIds.has(messageId)) {
        failures.push(`Agent action ${action.stepId} references unknown input message ${messageId}`);
      }
    }
    if (!action.outputArtifactId) {
      failures.push(`Agent action ${action.stepId} is missing outputArtifactId`);
      continue;
    }

    if (actionsByOutputArtifact.has(action.outputArtifactId)) {
      failures.push(`Duplicate agent action output artifact: ${action.outputArtifactId}`);
    }
    actionsByOutputArtifact.set(action.outputArtifactId, action);

    const artifact = artifactsById.get(action.outputArtifactId);
    if (!artifact) {
      failures.push(`Agent action ${action.stepId} references unknown output artifact ${action.outputArtifactId}`);
      continue;
    }
    if (artifact.ownerAgentId !== action.agentId) {
      failures.push(`Agent action ${action.stepId} agent ${action.agentId} does not match artifact owner ${artifact.ownerAgentId}`);
    }
    if (artifact.type !== action.outputType) {
      failures.push(`Agent action ${action.stepId} output type ${action.outputType} does not match artifact type ${artifact.type}`);
    }
  }

  for (const artifact of artifactsById.values()) {
    if (!actionsByOutputArtifact.has(artifact.id)) {
      failures.push(`Artifact ${artifact.type} is missing completed agent action`);
    }
  }
}

async function validateAgentMessages(
  finalPackageDir: string,
  artifactsById: Map<string, Artifact>,
  agentIds: Set<string>,
  failures: string[]
): Promise<Set<string>> {
  const messagePath = join(finalPackageDir, "trace", "agent-messages.json");
  const messageIds = new Set<string>();
  if (!(await pathExists(messagePath))) {
    return messageIds;
  }

  let messages: AgentMessageRecord[];
  try {
    const parsed = JSON.parse(await readFile(messagePath, "utf8")) as { messages?: AgentMessageRecord[] };
    messages = parsed.messages ?? [];
  } catch {
    failures.push("Agent message trace is not valid JSON");
    return messageIds;
  }

  for (const message of messages) {
    const messageId = typeof message.id === "string" && message.id.length > 0 ? message.id : "unknown";
    if (messageIds.has(message.id)) {
      failures.push(`Duplicate agent message id: ${messageId}`);
    }
    messageIds.add(message.id);

    if (!validAgentMessageTypes.has(message.type)) {
      failures.push(`Agent message ${messageId} has unknown type ${message.type}`);
    }
    if (message.from !== "orchestrator" && !agentIds.has(message.from)) {
      failures.push(`Agent message ${messageId} has unknown sender ${message.from}`);
    }
    if (!agentIds.has(message.to)) {
      failures.push(`Agent message ${messageId} has unknown recipient ${message.to}`);
    }
    if (typeof message.question !== "string" || !message.question.trim()) {
      failures.push(`Agent message ${messageId} is missing question`);
    }
    if (typeof message.expectedOutput !== "string" || !message.expectedOutput.trim()) {
      failures.push(`Agent message ${messageId} is missing expectedOutput`);
    }
    if (message.artifactId) {
      const artifact = artifactsById.get(message.artifactId);
      if (!artifact) {
        failures.push(`Agent message ${messageId} references unknown artifact ${message.artifactId}`);
      } else {
        if (message.artifactType !== artifact.type) {
          failures.push(`Agent message ${messageId} artifactType ${message.artifactType ?? "missing"} does not match artifact ${artifact.type}`);
        }
        if (message.from !== "orchestrator" && artifact.ownerAgentId !== message.from) {
          failures.push(`Agent message ${messageId} sender ${message.from} does not own artifact ${message.artifactId}`);
        }
      }
    }
  }

  return messageIds;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
