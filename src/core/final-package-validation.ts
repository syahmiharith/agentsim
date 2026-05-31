import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { validateAppSpec } from "../app-spec/app-spec-validation.js";
import type { GeneratedAppValidation } from "./generated-app-validation.js";
import type { AgentActionRecord, AgentMessageRecord, Artifact, ContextEvaluation, ContextPackage, DomainPack, ValidationResult } from "../types.js";
import { validateContextPackage } from "./context.js";
import { sha256 } from "./hash.js";

const validAgentMessageTypes = new Set(["task.assignment", "artifact.handoff", "review.request"]);

export interface FinalPackageValidationInput {
  finalPackageDir: string;
  artifacts: Artifact[];
  domainPack: DomainPack;
  privatePathPrefixes?: string[];
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
  const contextPackages = await validateContextPackages(input.finalPackageDir, failures);
  await validateContextEvaluation(input.finalPackageDir, failures);
  await validateAgentActions(input.finalPackageDir, artifactsById, messageIds, contextPackages, failures);
  await validateAppSpecTrace(input.finalPackageDir, failures);
  await validateAppValidationTrace(input.finalPackageDir, failures);
  await validateDomainInferenceTrace(input.finalPackageDir, failures);
  await validateWorkflowGraphTrace(input.finalPackageDir, failures);
  await validateToolRegistryTrace(input.finalPackageDir, failures);
  await validateRepoContextTrace(input.finalPackageDir, failures);
  await validateTracePrivacy(input.finalPackageDir, input.privatePathPrefixes ?? [], failures);

  return {
    ok: failures.length === 0,
    failures,
  };
}

async function validateTracePrivacy(finalPackageDir: string, privatePathPrefixes: string[], failures: string[]): Promise<void> {
  const traceDir = join(finalPackageDir, "trace");
  if (!(await pathExists(traceDir))) {
    return;
  }

  const candidates = [finalPackageDir, dirname(finalPackageDir), dirname(dirname(finalPackageDir)), process.cwd(), ...privatePathPrefixes];
  const privateValues = createPrivatePathValues(candidates);
  if (privateValues.length === 0) {
    return;
  }

  for (const file of await listTraceFiles(traceDir)) {
    const content = await readFile(file, "utf8");
    const leakedValue = privateValues.find((value) => content.includes(value));
    if (leakedValue) {
      failures.push(`Trace file ${relative(finalPackageDir, file)} contains private local path ${leakedValue}`);
    }
  }
}

async function listTraceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(root, entry.name);
      return entry.isDirectory() ? listTraceFiles(path) : [path];
    }),
  );
  return files.flat();
}

function createPrivatePathValues(paths: string[]): string[] {
  const values = new Set<string>();
  for (const path of paths) {
    if (!isPrivatePathCandidate(path)) {
      continue;
    }
    values.add(path);
    values.add(path.replaceAll("\\", "/"));
    values.add(path.replaceAll("/", "\\"));
    values.add(JSON.stringify(path).slice(1, -1));
    values.add(JSON.stringify(path.replaceAll("\\", "/")).slice(1, -1));
    values.add(JSON.stringify(path.replaceAll("/", "\\")).slice(1, -1));
  }
  return [...values].filter(isPrivatePathCandidate).sort((left, right) => right.length - left.length);
}

function isPrivatePathCandidate(path: string | undefined): path is string {
  return typeof path === "string" && path.trim().length > 3;
}

async function validateWorkflowGraphTrace(finalPackageDir: string, failures: string[]): Promise<void> {
  const graphPath = join(finalPackageDir, "trace", "workflow-graph.json");
  if (!(await pathExists(graphPath))) {
    return;
  }
  try {
    const graph = JSON.parse(await readFile(graphPath, "utf8")) as { schemaVersion?: unknown; nodes?: unknown; edges?: unknown };
    if (graph.schemaVersion !== 1) {
      failures.push("Workflow graph trace schemaVersion must be 1");
    }
    if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) {
      failures.push("Workflow graph trace must include nodes");
    }
    if (!Array.isArray(graph.edges)) {
      failures.push("Workflow graph trace must include edges");
    }
  } catch {
    failures.push("Workflow graph trace is not valid JSON");
  }
}

async function validateToolRegistryTrace(finalPackageDir: string, failures: string[]): Promise<void> {
  const registryPath = join(finalPackageDir, "trace", "tool-registry.json");
  if (!(await pathExists(registryPath))) {
    return;
  }
  try {
    const registry = JSON.parse(await readFile(registryPath, "utf8")) as { schemaVersion?: unknown; tools?: unknown };
    if (registry.schemaVersion !== 1) {
      failures.push("Tool registry trace schemaVersion must be 1");
    }
    if (!Array.isArray(registry.tools) || !registry.tools.every((tool) => typeof tool?.name === "string")) {
      failures.push("Tool registry trace tools must include tool names");
    }
  } catch {
    failures.push("Tool registry trace is not valid JSON");
  }
}

async function validateRepoContextTrace(finalPackageDir: string, failures: string[]): Promise<void> {
  const repoPath = join(finalPackageDir, "trace", "repo-context.json");
  if (!(await pathExists(repoPath))) {
    return;
  }
  try {
    const repoContext = JSON.parse(await readFile(repoPath, "utf8")) as { rootPath?: unknown; importantFiles?: unknown };
    if (typeof repoContext.rootPath !== "string" || repoContext.rootPath.length === 0) {
      failures.push("Repo context trace is missing rootPath");
    }
    if (!Array.isArray(repoContext.importantFiles)) {
      failures.push("Repo context trace importantFiles must be an array");
    }
  } catch {
    failures.push("Repo context trace is not valid JSON");
  }
}

async function validateDomainInferenceTrace(finalPackageDir: string, failures: string[]): Promise<void> {
  const inferencePath = join(finalPackageDir, "trace", "domain-inference.json");
  if (!(await pathExists(inferencePath))) {
    return;
  }

  let inference: {
    matchedPresetId?: unknown;
    confidence?: unknown;
    matchedKeywords?: unknown;
    warnings?: unknown;
    needsClarification?: unknown;
    fallbackUsed?: unknown;
  };
  try {
    inference = JSON.parse(await readFile(inferencePath, "utf8"));
  } catch {
    failures.push("Domain inference trace is not valid JSON");
    return;
  }

  if (typeof inference.matchedPresetId !== "string" || inference.matchedPresetId.length === 0) {
    failures.push("Domain inference trace is missing matchedPresetId");
  }
  if (typeof inference.confidence !== "number" || inference.confidence < 0 || inference.confidence > 1) {
    failures.push("Domain inference trace confidence must be between 0 and 1");
  }
  if (!Array.isArray(inference.matchedKeywords) || !inference.matchedKeywords.every((item) => typeof item === "string")) {
    failures.push("Domain inference trace matchedKeywords must be an array of strings");
  }
  if (!Array.isArray(inference.warnings) || !inference.warnings.every((item) => typeof item === "string")) {
    failures.push("Domain inference trace warnings must be an array of strings");
  }
  if (typeof inference.needsClarification !== "boolean") {
    failures.push("Domain inference trace needsClarification must be boolean");
  }
  if (typeof inference.fallbackUsed !== "boolean") {
    failures.push("Domain inference trace fallbackUsed must be boolean");
  }
}

async function validateAppSpecTrace(finalPackageDir: string, failures: string[]): Promise<void> {
  const appSpecPath = join(finalPackageDir, "trace", "app-spec.json");
  if (!(await pathExists(appSpecPath))) {
    return;
  }

  try {
    const appSpec = JSON.parse(await readFile(appSpecPath, "utf8"));
    const validation = validateAppSpec(appSpec);
    failures.push(...validation.failures.map((failure) => `AppSpec trace ${failure}`));
  } catch {
    failures.push("AppSpec trace is not valid JSON");
  }
}

async function validateAppValidationTrace(finalPackageDir: string, failures: string[]): Promise<void> {
  const appValidationPath = join(finalPackageDir, "trace", "app-validation.json");
  if (!(await pathExists(appValidationPath))) {
    return;
  }

  let appValidation: GeneratedAppValidation;
  try {
    appValidation = JSON.parse(await readFile(appValidationPath, "utf8")) as GeneratedAppValidation;
  } catch {
    failures.push("Generated app validation trace is not valid JSON");
    return;
  }

  if (appValidation.schemaVersion !== 1) {
    failures.push("Generated app validation trace schemaVersion must be 1");
  }
  if (typeof appValidation.ok !== "boolean") {
    failures.push("Generated app validation trace ok must be boolean");
  }
  if (typeof appValidation.message !== "string" || appValidation.message.trim().length === 0) {
    failures.push("Generated app validation trace is missing message");
  }
  if (!Array.isArray(appValidation.checks) || appValidation.checks.length === 0) {
    failures.push("Generated app validation trace checks must not be empty");
  } else {
    for (const check of appValidation.checks) {
      if (typeof check.id !== "string" || check.id.trim().length === 0) {
        failures.push("Generated app validation trace contains a check without id");
      }
      if (check.status !== "passed" && check.status !== "failed") {
        failures.push(`Generated app validation trace check ${check.id ?? "unknown"} has invalid status`);
      }
      if (check.status === "failed") {
        failures.push(`Generated app validation trace check ${check.id} failed`);
      }
      if (typeof check.message !== "string" || check.message.trim().length === 0) {
        failures.push(`Generated app validation trace check ${check.id ?? "unknown"} is missing message`);
      }
    }
  }
  if (!appValidation.ok) {
    failures.push("Generated app validation trace reports ok: false");
  }
}

async function validateAgentActions(
  finalPackageDir: string,
  artifactsById: Map<string, Artifact>,
  messageIds: Set<string>,
  contextPackages: ContextPackage[],
  failures: string[],
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
  const contextPackagesById = new Map(contextPackages.map((contextPackage) => [contextPackage.id, contextPackage]));
  for (const action of actions) {
    if (action.status !== "completed") {
      failures.push(`Agent action ${action.stepId} did not complete`);
    }
    const contextPackage = action.contextPackageId ? contextPackagesById.get(action.contextPackageId) : undefined;
    if (!contextPackage) {
      failures.push(`Agent action ${action.stepId} is missing contextPackageId`);
    } else {
      if (action.contextHash !== contextPackage.contextHash) {
        failures.push(`Agent action ${action.stepId} contextHash does not match stored context package`);
      }
      for (const inputArtifactId of action.inputArtifactIds ?? []) {
        if (!contextPackage.inputArtifactIds.includes(inputArtifactId)) {
          failures.push(`Agent action ${action.stepId} input artifact ${inputArtifactId} is missing from context package`);
        }
      }
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
    if (contextPackage) {
      if (artifact.lineage?.contextPackageId !== contextPackage.id) {
        failures.push(`Artifact ${artifact.type} lineage is missing contextPackageId ${contextPackage.id}`);
      }
      if (artifact.lineage?.contextHash !== contextPackage.contextHash) {
        failures.push(`Artifact ${artifact.type} lineage contextHash does not match context package`);
      }
    }
  }

  for (const artifact of artifactsById.values()) {
    if (!actionsByOutputArtifact.has(artifact.id)) {
      failures.push(`Artifact ${artifact.type} is missing completed agent action`);
    }
  }
}

async function validateContextPackages(finalPackageDir: string, failures: string[]): Promise<ContextPackage[]> {
  const contextPath = join(finalPackageDir, "trace", "context-packages.json");
  if (!(await pathExists(contextPath))) {
    return [];
  }

  let contextPackages: ContextPackage[];
  try {
    const parsed = JSON.parse(await readFile(contextPath, "utf8")) as { contextPackages?: ContextPackage[] };
    contextPackages = parsed.contextPackages ?? [];
  } catch {
    failures.push("Context package trace is not valid JSON");
    return [];
  }

  const seen = new Set<string>();
  for (const contextPackage of contextPackages) {
    if (seen.has(contextPackage.id)) {
      failures.push(`Duplicate context package id: ${contextPackage.id}`);
    }
    seen.add(contextPackage.id);
    const validation = validateContextPackage(contextPackage);
    failures.push(...validation.failures);
  }

  return contextPackages;
}

async function validateContextEvaluation(finalPackageDir: string, failures: string[]): Promise<void> {
  const evalPath = join(finalPackageDir, "trace", "context-eval.json");
  if (!(await pathExists(evalPath))) {
    return;
  }

  let evaluation: ContextEvaluation | undefined;
  try {
    const parsed = JSON.parse(await readFile(evalPath, "utf8")) as { evaluation?: ContextEvaluation };
    evaluation = parsed.evaluation;
  } catch {
    failures.push("Context evaluation trace is not valid JSON");
    return;
  }

  if (!evaluation) {
    failures.push("Context evaluation trace is missing evaluation");
    return;
  }
  if (!evaluation.requiredCoverageOk) {
    failures.push("Context evaluation reports incomplete required coverage");
  }
  if (!evaluation.provenanceOk) {
    failures.push("Context evaluation reports incomplete provenance");
  }
  for (const failure of evaluation.failures ?? []) {
    failures.push(`Context evaluation failure: ${failure}`);
  }
}

async function validateAgentMessages(
  finalPackageDir: string,
  artifactsById: Map<string, Artifact>,
  agentIds: Set<string>,
  failures: string[],
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
