import type { AgentStep, ArtifactType, Task, TaskKind } from "../types.js";

export function compileAgentStepsToTasks(runId: string, agentSteps: AgentStep[]): Task[] {
  const now = new Date().toISOString();
  const producers = new Map<ArtifactType, string>();

  for (const step of agentSteps) {
    if (producers.has(step.outputType)) {
      throw new Error(`Duplicate producer for artifact type: ${step.outputType}`);
    }
    producers.set(step.outputType, step.id);
  }

  const tasks = agentSteps.map((step): Task => {
    const dependsOn = step.requiredInputs.map((artifactType) => {
      const producer = producers.get(artifactType);
      if (!producer) {
        throw new Error(`Agent step ${step.id} requires ${artifactType}, but no producer exists.`);
      }
      return producer;
    });

    return {
      id: step.id,
      runId,
      title: step.action,
      description: `Produce ${step.outputType}.`,
      kind: inferTaskKind(step),
      assignedAgentId: step.ownerAgentId,
      status: dependsOn.length === 0 ? "ready" : "pending",
      dependsOn,
      requiredArtifactTypes: step.requiredInputs,
      outputArtifactType: step.outputType,
      attempts: 0,
      maxAttempts: 2,
      reviewCycle: step.reviewRequired ? 1 : undefined,
      createdAt: now,
      updatedAt: now
    };
  });

  assertNoCycles(tasks);
  return tasks;
}

function inferTaskKind(step: AgentStep): TaskKind {
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

function assertNoCycles(tasks: Task[]): void {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function visit(taskId: string): void {
    if (visiting.has(taskId)) {
      throw new Error(`Task graph has a cycle at ${taskId}.`);
    }
    if (visited.has(taskId)) {
      return;
    }

    const task = byId.get(taskId);
    if (!task) {
      throw new Error(`Task graph references unknown dependency ${taskId}.`);
    }

    visiting.add(taskId);
    for (const dependencyId of task.dependsOn) {
      visit(dependencyId);
    }
    visiting.delete(taskId);
    visited.add(taskId);
  }

  for (const task of tasks) {
    visit(task.id);
  }
}
