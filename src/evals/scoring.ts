import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { RunDemoResult } from "../orchestrator.js";

export interface EvalCaseResult {
  prompt: string;
  runId: string;
  status: string;
  artifactCount: number;
  finalPackagePath: string;
  requiredAppFilesPresent: boolean;
  failures: string[];
}

export async function scoreEvalRun(prompt: string, runId: string, result: RunDemoResult): Promise<EvalCaseResult> {
  const failures: string[] = [];
  const requiredAppFiles = ["package.json", "src/App.tsx", "server.js", "README.md"];

  for (const relativePath of requiredAppFiles) {
    try {
      await stat(join(result.finalPackageDir, "app", relativePath));
    } catch {
      failures.push(`Missing app file: app/${relativePath}`);
    }
  }

  if (result.taskRun.status !== "COMPLETED") {
    failures.push(`Run did not complete: ${result.taskRun.status}`);
  }

  return {
    prompt,
    runId,
    status: result.taskRun.status,
    artifactCount: result.artifacts.length,
    finalPackagePath: result.finalPackageDir,
    requiredAppFilesPresent: failures.every((failure) => !failure.startsWith("Missing app file")),
    failures
  };
}

export function summarizeEvalResults(results: EvalCaseResult[]): { total: number; passed: number; failed: number } {
  const passed = results.filter((result) => result.failures.length === 0).length;
  return {
    total: results.length,
    passed,
    failed: results.length - passed
  };
}
