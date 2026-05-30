import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { ContextEvaluation } from "../types.js";
import type { DomainSpec } from "../domain/domain-spec.js";
import type { RunDemoResult } from "../orchestrator.js";
import type { RunSummary, ValidationResult } from "../types.js";

export interface EvalCaseResult {
  prompt: string;
  runId: string;
  status: string;
  artifactCount: number;
  finalPackagePath: string;
  requiredAppFilesPresent: boolean;
  requiredTraceFilesPresent: boolean;
  finalValidationOk: boolean;
  contextCoverageOk: boolean;
  contextProvenanceOk: boolean;
  domainSpecPresent: boolean;
  appNameAppearsInApp: boolean;
  primaryEntityAppearsInApp: boolean;
  workflowStatusesAppearInApp: boolean;
  requiredFieldsAppearInApp: boolean;
  promptLeakageDetected: boolean;
  templateLeakageDetected: boolean;
  durationMs: number;
  validationResult?: ValidationResult;
  failureCategory: "none" | "missing_app_file" | "missing_trace_file" | "validation" | "context" | "domain_mismatch" | "run_status" | "runtime";
  failures: string[];
}

export async function scoreEvalRun(prompt: string, runId: string, result: RunDemoResult, options: { durationMs?: number } = {}): Promise<EvalCaseResult> {
  const failures: string[] = [];
  const requiredAppFiles = ["package.json", "src/App.tsx", "server.js", "README.md"];
  const requiredTraceFiles = ["domain-spec.json", "context-eval.json", "run-summary.json"];

  for (const relativePath of requiredAppFiles) {
    try {
      await stat(join(result.finalPackageDir, "app", relativePath));
    } catch {
      failures.push(`Missing app file: app/${relativePath}`);
    }
  }

  for (const relativePath of requiredTraceFiles) {
    try {
      await stat(join(result.finalPackageDir, "trace", relativePath));
    } catch {
      failures.push(`Missing trace file: trace/${relativePath}`);
    }
  }

  if (result.taskRun.status !== "COMPLETED") {
    failures.push(`Run did not complete: ${result.taskRun.status}`);
  }
  const validationResult = await readValidationResult(result.finalPackageDir);
  const finalValidationOk = validationResult?.ok === true;
  if (!validationResult) {
    failures.push("Missing final validation result");
  } else if (!validationResult.ok) {
    failures.push(...validationResult.failures);
  }
  const traceDomainSpec = await readJsonFile<DomainSpec>(join(result.finalPackageDir, "trace/domain-spec.json"));
  const contextEvaluation = (await readJsonFile<{ evaluation: ContextEvaluation }>(join(result.finalPackageDir, "trace/context-eval.json")))?.evaluation;
  const appSource = await readTextFile(join(result.finalPackageDir, "app/src/App.tsx"));
  const appReadme = await readTextFile(join(result.finalPackageDir, "app/README.md"));
  const requirements = await readTextFile(join(result.finalPackageDir, "planning/requirements.md"));
  const projectSummary = await readTextFile(join(result.finalPackageDir, "client/project-summary.md"));
  const keyDocs = [requirements, projectSummary].join("\n");
  const appSurface = [appSource, appReadme].join("\n");
  const fullSurface = [appSurface, keyDocs].join("\n");

  const domainSpecPresent = isDomainSpec(traceDomainSpec);
  if (!domainSpecPresent) {
    failures.push("Missing or invalid trace/domain-spec.json");
  } else {
    assertDomainSpecMatches(result.domainSpec, traceDomainSpec, failures);
  }

  const appNameAppearsInApp = containsText(appSurface, result.domainSpec.appName);
  const primaryEntityAppearsInApp = containsAnyText(appSurface, [
    result.domainSpec.primaryEntity.name,
    result.domainSpec.primaryEntity.pluralName
  ]);
  const workflowStatusesAppearInApp = result.domainSpec.workflowStatuses.every((status) => containsText(appSource, status));
  const requiredFieldsAppearInApp = result.domainSpec.primaryEntity.fields
    .filter((field) => field.required)
    .every((field) => containsAnyText(appSource, [field.label, field.name]));
  const domainDocsMatch = containsText(keyDocs, result.domainSpec.appName) &&
    containsAnyText(keyDocs, [result.domainSpec.primaryEntity.name, result.domainSpec.primaryEntity.pluralName]);
  const contextCoverageOk = contextEvaluation?.requiredCoverageOk === true;
  const contextProvenanceOk = contextEvaluation?.provenanceOk === true;
  const promptLeakageDetected = prompt.trim().length > 0 && containsText(appSurface, prompt);
  const templateLeakageDetected = detectsTemplateLeakage(fullSurface, result.domainSpec);

  if (!appNameAppearsInApp) {
    failures.push(`App surface does not contain app name ${result.domainSpec.appName}`);
  }
  if (!primaryEntityAppearsInApp) {
    failures.push(`App surface does not contain primary entity ${result.domainSpec.primaryEntity.name}`);
  }
  if (!workflowStatusesAppearInApp) {
    failures.push("App source does not contain every workflow status");
  }
  if (!requiredFieldsAppearInApp) {
    failures.push("App source does not contain every required field");
  }
  if (!domainDocsMatch) {
    failures.push("Key markdown artifacts do not match the generated domain spec");
  }
  if (!contextEvaluation) {
    failures.push("Missing context evaluation");
  } else {
    if (!contextCoverageOk) {
      failures.push("Context evaluation reports incomplete required coverage");
    }
    if (!contextProvenanceOk) {
      failures.push("Context evaluation reports incomplete provenance");
    }
    failures.push(...contextEvaluation.failures.map((failure) => `Context evaluation failure: ${failure}`));
  }
  if (promptLeakageDetected) {
    failures.push("Runnable app surface contains the raw prompt");
  }
  if (templateLeakageDetected) {
    failures.push("Generated package contains stale generic or template placeholder text");
  }

  return {
    prompt,
    runId,
    status: result.taskRun.status,
    artifactCount: result.artifacts.length,
    finalPackagePath: result.finalPackageDir,
    requiredAppFilesPresent: failures.every((failure) => !failure.startsWith("Missing app file")),
    requiredTraceFilesPresent: failures.every((failure) => !failure.startsWith("Missing trace file")),
    finalValidationOk,
    contextCoverageOk,
    contextProvenanceOk,
    domainSpecPresent,
    appNameAppearsInApp,
    primaryEntityAppearsInApp,
    workflowStatusesAppearInApp,
    requiredFieldsAppearInApp,
    promptLeakageDetected,
    templateLeakageDetected,
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

async function readJsonFile<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return undefined;
  }
}

async function readTextFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
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
  if (failures.some((failure) => failure.startsWith("Missing trace file"))) {
    return "missing_trace_file";
  }
  if (failures.some((failure) => failure.toLowerCase().includes("validation"))) {
    return "validation";
  }
  if (failures.some((failure) => failure.startsWith("Context evaluation"))) {
    return "context";
  }
  if (failures.some((failure) => failure.includes("domain spec") || failure.includes("App surface") || failure.includes("App source") || failure.includes("markdown artifacts"))) {
    return "domain_mismatch";
  }
  if (status !== "COMPLETED") {
    return "run_status";
  }
  return "runtime";
}

function assertDomainSpecMatches(expected: DomainSpec, actual: DomainSpec | undefined, failures: string[]): void {
  if (!actual) {
    return;
  }
  if (actual.appName !== expected.appName) {
    failures.push(`Trace domain spec appName ${actual.appName} does not match ${expected.appName}`);
  }
  if (actual.primaryEntity?.name !== expected.primaryEntity.name) {
    failures.push(`Trace domain spec primary entity ${actual.primaryEntity?.name ?? "unknown"} does not match ${expected.primaryEntity.name}`);
  }
  for (const status of expected.workflowStatuses) {
    if (!actual.workflowStatuses?.includes(status)) {
      failures.push(`Trace domain spec is missing workflow status ${status}`);
    }
  }
  for (const field of expected.primaryEntity.fields.filter((field) => field.required)) {
    if (!actual.primaryEntity?.fields?.some((candidate) => candidate.name === field.name && candidate.label === field.label)) {
      failures.push(`Trace domain spec is missing required field ${field.name}`);
    }
  }
}

function isDomainSpec(value: DomainSpec | undefined): value is DomainSpec {
  return Boolean(
    value &&
    typeof value.appName === "string" &&
    typeof value.primaryEntity?.name === "string" &&
    Array.isArray(value.primaryEntity?.fields) &&
    Array.isArray(value.workflowStatuses)
  );
}

function containsAnyText(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => containsText(haystack, needle));
}

function containsText(haystack: string, needle: string): boolean {
  return normalize(haystack).includes(normalize(needle));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function detectsTemplateLeakage(surface: string, expected: DomainSpec): boolean {
  const normalizedSurface = normalize(surface);
  const placeholderNeedles = [
    "{{",
    "}}",
    "lorem ipsum",
    "todo:",
    "deterministic scaffold",
    "template placeholder"
  ];
  if (placeholderNeedles.some((needle) => normalizedSurface.includes(needle))) {
    return true;
  }
  return expected.appName !== "Client Request Tracker" && normalizedSurface.includes("client request tracker");
}
