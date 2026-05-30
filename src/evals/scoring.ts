import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { RunDemoResult } from "../orchestrator.js";
import type { RunSummary, ValidationResult } from "../types.js";

export interface EvalCaseResult {
  prompt: string;
  runId: string;
  status: string;
  artifactCount: number;
  finalPackagePath: string;
  requiredAppFilesPresent: boolean;
  durationMs: number;
  validationResult?: ValidationResult;
  failureCategory: "none" | "missing_app_file" | "validation" | "run_status" | "runtime";
  failures: string[];
}

export async function scoreEvalRun(prompt: string, runId: string, result: RunDemoResult, options: { durationMs?: number } = {}): Promise<EvalCaseResult> {
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
  const validationResult = await readValidationResult(result.finalPackageDir);
  if (validationResult && !validationResult.ok) {
    failures.push(...validationResult.failures);
  }

  return {
    prompt,
    runId,
    status: result.taskRun.status,
    artifactCount: result.artifacts.length,
    finalPackagePath: result.finalPackageDir,
    requiredAppFilesPresent: failures.every((failure) => !failure.startsWith("Missing app file")),
    durationMs: options.durationMs ?? durationFromTaskRun(result),
    validationResult,
    failureCategory: categorizeFailures(failures, result.taskRun.status),
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

async function readValidationResult(finalPackageDir: string): Promise<ValidationResult | undefined> {
  try {
    const summary = JSON.parse(await readFile(join(finalPackageDir, "trace/run-summary.json"), "utf8")) as RunSummary;
    return summary.validationResult;
  } catch {
    return undefined;
  }
}

function durationFromTaskRun(result: RunDemoResult): number {
  if (!result.taskRun.completedAt) {
    return 0;
  }
  return Math.max(0, Date.parse(result.taskRun.completedAt) - Date.parse(result.taskRun.startedAt));
}

function categorizeFailures(failures: string[], status: string): EvalCaseResult["failureCategory"] {
  if (failures.length === 0) {
    return "none";
  }
  if (failures.some((failure) => failure.startsWith("Missing app file"))) {
    return "missing_app_file";
  }
  if (failures.some((failure) => failure.toLowerCase().includes("validation"))) {
    return "validation";
  }
  if (status !== "COMPLETED") {
    return "run_status";
  }
  return "runtime";
}
