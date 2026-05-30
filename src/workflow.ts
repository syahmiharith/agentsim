import { runOrchestrator, type RunDemoOptions, type RunDemoResult } from "./orchestrator.js";

export type { RunDemoOptions, RunDemoResult };

export async function runDemo(options: RunDemoOptions): Promise<RunDemoResult> {
  return runOrchestrator(options);
}
