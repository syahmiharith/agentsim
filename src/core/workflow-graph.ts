import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AgentStep, ArtifactType, Task, TaskKind, ValidationResult } from "../types.js";

export type WorkflowNodeKind = TaskKind;

export type WorkflowCondition =
  | { type: "always" }
  | { type: "after_artifacts"; artifactTypes: ArtifactType[] };

export interface WorkflowGraphNode {
  id: string;
  title: string;
  description: string;
  kind: WorkflowNodeKind;
  agentId: AgentStep["ownerAgentId"];
  requiredArtifactTypes: ArtifactType[];
  outputArtifactType: ArtifactType;
  reviewRequired: boolean;
  timeoutMs: number;
  maxAttempts: number;
  condition: WorkflowCondition;
}

export interface WorkflowGraphEdge {
  from: string;
  to: string;
  reason: string;
}

export interface WorkflowGraph {
  schemaVersion: 1;
  runId: string;
  generatedAt: string;
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
}

const defaultTimeoutMs = 60_000;
const defaultMaxAttempts = 2;

export function compileAgentStepsToWorkflowGraph(runId: string, agentSteps: AgentStep[]): WorkflowGraph {
  const generatedAt = new Date().toISOString();
  const producers = new Map<ArtifactType, string>();

  for (const step of agentSteps) {
    if (producers.has(step.outputType)) {
      throw new Error(`Duplicate producer for artifact type: ${step.outputType}`);
    }
    producers.set(step.outputType, step.id);
  }

  const nodes = agentSteps.map((step): WorkflowGraphNode => ({
    id: step.id,
    title: step.action,
    description: `Produce ${step.outputType}.`,
    kind: inferNodeKind(step),
    agentId: step.ownerAgentId,
    requiredArtifactTypes: [...step.requiredInputs],
    outputArtifactType: step.outputType,
    reviewRequired: step.reviewRequired,
    timeoutMs: step.timeoutMs ?? defaultTimeoutMs,
    maxAttempts: defaultMaxAttempts,
    condition: step.requiredInputs.length > 0
      ? { type: "after_artifacts", artifactTypes: [...step.requiredInputs] }
      : { type: "always" }
  }));

  const edges = agentSteps.flatMap((step): WorkflowGraphEdge[] => step.requiredInputs.map((artifactType) => {
    const producer = producers.get(artifactType);
    if (!producer) {
      throw new Error(`Agent step ${step.id} requires ${artifactType}, but no producer exists.`);
    }
    return {
      from: producer,
      to: step.id,
      reason: `requires artifact ${artifactType}`
    };
  }));

  const graph = { schemaVersion: 1 as const, runId, generatedAt, nodes, edges };
  const validation = validateWorkflowGraph(graph);
  if (!validation.ok) {
    throw new Error(`Workflow graph validation failed: ${validation.failures.join("; ")}`);
  }
  return graph;
}

export function workflowGraphToTasks(graph: WorkflowGraph): Task[] {
  const dependencies = new Map(graph.nodes.map((node) => [node.id, [] as string[]]));
  for (const edge of graph.edges) {
    dependencies.get(edge.to)?.push(edge.from);
  }
  return graph.nodes.map((node): Task => {
    const dependsOn = dependencies.get(node.id) ?? [];
    return {
      id: node.id,
      runId: graph.runId,
      title: node.title,
      description: node.description,
      kind: node.kind,
      assignedAgentId: node.agentId,
      status: dependsOn.length === 0 ? "ready" : "pending",
      dependsOn,
      requiredArtifactTypes: node.requiredArtifactTypes,
      outputArtifactType: node.outputArtifactType,
      attempts: 0,
      maxAttempts: node.maxAttempts,
      timeoutMs: node.timeoutMs,
      reviewCycle: node.reviewRequired ? 1 : undefined,
      createdAt: graph.generatedAt,
      updatedAt: graph.generatedAt
    };
  });
}

export function validateWorkflowGraph(graph: WorkflowGraph): ValidationResult {
  const failures: string[] = [];
  const nodeIds = new Set<string>();
  const outputTypes = new Set<ArtifactType>();
  const edgeKeys = new Set<string>();

  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) {
      failures.push(`Duplicate workflow node id: ${node.id}`);
    }
    nodeIds.add(node.id);

    if (outputTypes.has(node.outputArtifactType)) {
      failures.push(`Duplicate workflow output artifact type: ${node.outputArtifactType}`);
    }
    outputTypes.add(node.outputArtifactType);

    if (!Number.isFinite(node.timeoutMs) || node.timeoutMs <= 0) {
      failures.push(`Workflow node ${node.id} has invalid timeoutMs`);
    }
    if (!Number.isInteger(node.maxAttempts) || node.maxAttempts < 1) {
      failures.push(`Workflow node ${node.id} has invalid maxAttempts`);
    }
  }

  for (const edge of graph.edges) {
    if (!nodeIds.has(edge.from)) {
      failures.push(`Workflow edge references unknown source node ${edge.from}`);
    }
    if (!nodeIds.has(edge.to)) {
      failures.push(`Workflow edge references unknown target node ${edge.to}`);
    }
    const edgeKey = `${edge.from}->${edge.to}:${edge.reason}`;
    if (edgeKeys.has(edgeKey)) {
      failures.push(`Duplicate workflow edge: ${edgeKey}`);
    }
    edgeKeys.add(edgeKey);
  }

  failures.push(...detectCycles(graph));
  return { ok: failures.length === 0, failures };
}

export async function exportWorkflowGraph(graph: WorkflowGraph, targetPath: string): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, JSON.stringify(graph, null, 2), "utf8");
}

function inferNodeKind(step: AgentStep): WorkflowNodeKind {
  if (step.outputType === "app") {
    return "app_generation";
  }
  if (step.ownerAgentId === "reviewer-qa") {
    return "review";
  }
  if (step.ownerAgentId === "delivery") {
    return "delivery";
  }
  return "artifact_generation";
}

function detectCycles(graph: WorkflowGraph): string[] {
  const failures: string[] = [];
  const edgesBySource = new Map<string, string[]>();
  for (const edge of graph.edges) {
    edgesBySource.set(edge.from, [...(edgesBySource.get(edge.from) ?? []), edge.to]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(nodeId: string): void {
    if (visiting.has(nodeId)) {
      failures.push(`Workflow graph has a cycle at ${nodeId}`);
      return;
    }
    if (visited.has(nodeId)) {
      return;
    }
    visiting.add(nodeId);
    for (const next of edgesBySource.get(nodeId) ?? []) {
      visit(next);
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
  }

  for (const node of graph.nodes) {
    visit(node.id);
  }
  return [...new Set(failures)];
}
