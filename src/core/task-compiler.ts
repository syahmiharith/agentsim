import type { AgentStep, Task } from "../types.js";
import { compileAgentStepsToWorkflowGraph, workflowGraphToTasks } from "./workflow-graph.js";

export function compileAgentStepsToTasks(runId: string, agentSteps: AgentStep[]): Task[] {
  return workflowGraphToTasks(compileAgentStepsToWorkflowGraph(runId, agentSteps));
}
