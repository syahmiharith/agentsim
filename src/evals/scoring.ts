import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { DomainSpec } from "../domain/domain-spec.js";
import { softwareFreelancePack } from "../domain/software-freelance-pack.js";
import type { RunDemoResult } from "../orchestrator.js";
import type { ContextEvaluation, RunSummary, ValidationResult } from "../types.js";
import {
  assertCommandPasses,
  assertContextEvalOk,
  assertFileContains,
  assertFileNotContains,
  assertJsonPathEquals,
  assertJsonPathIncludes,
  assertRequiredArtifacts,
  assertTraceCompleteness,
  readJsonFile,
  readText
} from "./assertions.js";
import type { EvalCase, EvalFailure, EvalFailureCategory } from "./types.js";

export interface EvalCaseResult {
  caseId: string;
  suite: string;
  difficulty: string;
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
  hardGatePassed: boolean;
  accepted: boolean;
  acceptanceCriteriaScore: number;
  runnableAppScore: number;
  domainFidelityScore: number;
  packageCompletenessScore: number;
  traceabilityScore: number;
  reviewabilityScore: number;
  qualityScore: number;
  durationMs: number;
  validationResult?: ValidationResult;
  failureCategory: EvalFailureCategory;
  failures: EvalFailure[];
}

export interface EvalSummary {
  total: number;
  passed: number;
  failed: number;
  acceptedRuns: number;
  averageQualityScore: number;
  p50DurationMs: number;
  p95DurationMs: number;
  failureCategories: Record<string, number>;
}

export async function scoreEvalRun(evalCaseOrPrompt: EvalCase | string, runId: string, result: RunDemoResult, options: { durationMs?: number } = {}): Promise<EvalCaseResult> {
  const evalCase = typeof evalCaseOrPrompt === "string" ? caseFromDomainSpec(evalCaseOrPrompt, result.domainSpec) : evalCaseOrPrompt;
  const root = result.finalPackageDir;
  const failures: EvalFailure[] = [];
  const requiredAppFiles = ["app/package.json", "app/src/App.tsx", "app/server.js", "app/README.md"];
  const requiredTraceFiles = [...softwareFreelancePack.requiredTraceFiles, "trace/run-summary.json"];
  const requiredFinalPackageFiles = [...softwareFreelancePack.requiredFinalPackageFiles, ...evalCase.expected.requiredArtifacts];

  failures.push(...await assertRequiredArtifacts(root, requiredFinalPackageFiles));
  failures.push(...await assertTraceCompleteness(root, requiredTraceFiles));

  if (result.taskRun.status !== "COMPLETED") {
    failures.push({
      code: "run_status_not_completed",
      message: `Run did not complete: ${result.taskRun.status}`,
      severity: "error",
      expected: "COMPLETED",
      actual: result.taskRun.status
    });
  }

  const validationResult = await readValidationResult(root);
  const finalValidationOk = validationResult?.ok === true;
  if (!validationResult) {
    failures.push({ code: "validation_result_missing", message: "Missing final validation result.", severity: "error", path: "trace/run-summary.json" });
  } else if (!validationResult.ok) {
    failures.push(...validationResult.failures.map((message) => ({ code: "final_package_validation_failed", message, severity: "error" as const, path: "trace/run-summary.json" })));
  }

  const traceDomainSpec = await readJsonFile<DomainSpec>(root, "trace/domain-spec.json");
  const contextEvaluation = (await readJsonFile<{ evaluation: ContextEvaluation }>(root, "trace/context-eval.json"))?.evaluation;
  const appSource = await readText(root, "app/src/App.tsx") ?? "";
  const appReadme = await readText(root, "app/README.md") ?? "";
  const requirements = await readText(root, "planning/requirements.md") ?? "";
  const projectSummary = await readText(root, "client/project-summary.md") ?? "";
  const qaReport = await readText(root, "review/qa-report.md") ?? "";
  const codeReview = await readText(root, "review/code-review.md") ?? "";
  const knownIssues = await readText(root, "review/known-issues.md") ?? "";
  const keyDocs = [requirements, projectSummary].join("\n");
  const appSurface = [appSource, appReadme].join("\n");
  const fullSurface = [appSurface, keyDocs, qaReport, codeReview, knownIssues].join("\n");

  const domainSpecPresent = isDomainSpec(traceDomainSpec);
  if (!domainSpecPresent) {
    failures.push({ code: "domain_spec_missing", message: "Missing or invalid trace/domain-spec.json.", severity: "error", path: "trace/domain-spec.json" });
  } else {
    failures.push(...assertJsonPathEquals(traceDomainSpec, "appName", evalCase.expected.appName, "domain_app_name_mismatch"));
    failures.push(...assertJsonPathEquals(traceDomainSpec, "primaryEntity.name", evalCase.expected.primaryEntity, "domain_primary_entity_mismatch"));
    for (const status of evalCase.expected.requiredStatuses) {
      failures.push(...assertJsonPathIncludes(traceDomainSpec, "workflowStatuses", status, "domain_status_missing"));
    }
    const fieldNames = traceDomainSpec.primaryEntity.fields.map((field) => field.name);
    for (const field of evalCase.expected.requiredFields) {
      if (!fieldNames.includes(field)) {
        failures.push({
          code: "domain_field_missing",
          message: `Trace domain spec is missing required field ${field}`,
          severity: "error",
          path: "trace/domain-spec.json",
          expected: field,
          actual: fieldNames
        });
      }
    }
  }

  for (const phrase of evalCase.expected.requiredPhrases) {
    failures.push(...await assertFileContains(root, phrase.path, phrase.terms));
  }
  for (const phrase of evalCase.expected.forbiddenPhrases) {
    failures.push(...await assertFileNotContains(root, phrase.path, phrase.terms));
  }
  for (const commandCheck of evalCase.expected.commands ?? []) {
    failures.push(...await assertCommandPasses(root, commandCheck));
  }
  failures.push(...await assertContextEvalOk(root));

  const appNameAppearsInApp = containsText(appSurface, evalCase.expected.appName);
  const primaryEntityAppearsInApp = containsText(appSurface, evalCase.expected.primaryEntity);
  const workflowStatusesAppearInApp = evalCase.expected.requiredStatuses.every((status) => containsText(appSource, status));
  const requiredFieldsAppearInApp = evalCase.expected.requiredFields.every((field) => containsText(appSource, field));
  const domainDocsMatch = containsText(keyDocs, evalCase.expected.appName) && containsText(keyDocs, evalCase.expected.primaryEntity);
  const contextCoverageOk = contextEvaluation?.requiredCoverageOk === true;
  const contextProvenanceOk = contextEvaluation?.provenanceOk === true;
  const promptLeakageDetected = evalCase.prompt.trim().length > 0 && containsText(appSurface, evalCase.prompt);
  const templateLeakageDetected = detectsTemplateLeakage(fullSurface, evalCase.expected.appName);
  const secretLeakageDetected = await detectSecretLeakage(root, evalCase.prompt);

  if (!appNameAppearsInApp) {
    failures.push({ code: "app_name_missing", message: `App surface does not contain app name ${evalCase.expected.appName}`, severity: "error", path: "app/src/App.tsx" });
  }
  if (!primaryEntityAppearsInApp) {
    failures.push({ code: "primary_entity_missing", message: `App surface does not contain primary entity ${evalCase.expected.primaryEntity}`, severity: "error", path: "app/src/App.tsx" });
  }
  if (!workflowStatusesAppearInApp) {
    failures.push({ code: "workflow_statuses_missing", message: "App source does not contain every workflow status.", severity: "error", path: "app/src/App.tsx" });
  }
  if (!requiredFieldsAppearInApp) {
    failures.push({ code: "required_fields_missing", message: "App source does not contain every required field.", severity: "error", path: "app/src/App.tsx" });
  }
  if (!domainDocsMatch) {
    failures.push({ code: "domain_docs_mismatch", message: "Key markdown artifacts do not match the expected domain.", severity: "error", path: "planning/requirements.md" });
  }
  if (promptLeakageDetected) {
    failures.push({ code: "raw_prompt_leaked", message: "Runnable app surface contains the raw prompt.", severity: "error", path: "app/src/App.tsx" });
  }
  if (templateLeakageDetected) {
    failures.push({ code: "template_text_leaked", message: "Generated package contains stale generic or template placeholder text.", severity: "error" });
  }
  if (secretLeakageDetected) {
    failures.push({ code: "secret_leaked", message: "Generated package contains a secret-looking token from the prompt.", severity: "error" });
  }

  const commandFailures = failures.filter((item) => item.code === "command_failed" && item.severity === "error").length;
  const appFileFailures = failures.filter((item) => item.code === "final_package_file_missing" && requiredAppFiles.includes(item.path ?? "")).length;
  const requiredArtifactFailures = failures.filter((item) => item.code === "final_package_file_missing" || item.code === "trace_file_missing").length;
  const requiredPhraseFailures = failures.filter((item) => item.code === "required_phrase_missing").length;
  const forbiddenPhraseFailures = failures.filter((item) => item.code === "forbidden_phrase_present").length;
  const domainFailures = failures.filter((item) => item.code.startsWith("domain_") || item.code === "app_name_missing" || item.code === "primary_entity_missing" || item.code === "workflow_statuses_missing" || item.code === "required_fields_missing" || item.code === "domain_docs_mismatch").length;
  const traceFailures = failures.filter((item) => item.code === "trace_file_missing" || item.code.startsWith("context_") || item.code.includes("lineage")).length;
  const reviewFailures = failures.filter((item) => item.path?.startsWith("review/") && item.severity === "error").length;

  const acceptanceCriteriaScore = ratio(1 + evalCase.expected.requiredPhrases.reduce((sum, item) => sum + item.terms.length, 0), requiredPhraseFailures + (domainDocsMatch ? 0 : 1));
  const runnableAppScore = ratio(requiredAppFiles.length + 1 + (evalCase.expected.commands?.filter((command) => !command.optional).length ?? 0), appFileFailures + (finalValidationOk ? 0 : 1) + commandFailures);
  const domainFidelityScore = ratio(
    2 + evalCase.expected.requiredFields.length + evalCase.expected.requiredStatuses.length + evalCase.expected.forbiddenPhrases.reduce((sum, item) => sum + item.terms.length, 0),
    domainFailures + forbiddenPhraseFailures
  );
  const packageCompletenessScore = ratio(requiredFinalPackageFiles.length, requiredArtifactFailures);
  const traceabilityScore = ratio(requiredTraceFiles.length + 2, traceFailures + (contextCoverageOk ? 0 : 1) + (contextProvenanceOk ? 0 : 1));
  const reviewSignals = [
    qaReport.length > 0 && containsText(qaReport, "Generated App Validation"),
    codeReview.length > 0 && containsText(codeReview, "Findings"),
    knownIssues.length > 0 && containsText(knownIssues, "Known Issues")
  ];
  const reviewabilityScore = ratio(3, reviewFailures + reviewSignals.filter((ok) => !ok).length);
  const qualityScore = roundScore(
    (0.30 * acceptanceCriteriaScore) +
    (0.20 * runnableAppScore) +
    (0.20 * domainFidelityScore) +
    (0.10 * packageCompletenessScore) +
    (0.10 * traceabilityScore) +
    (0.10 * reviewabilityScore)
  );
  const hardGatePassed = failures.every((item) => !hardGateCodes.has(item.code) || item.severity !== "error");

  return {
    caseId: evalCase.id,
    suite: evalCase.suite,
    difficulty: evalCase.difficulty,
    prompt: evalCase.prompt,
    runId,
    status: result.taskRun.status,
    artifactCount: result.artifacts.length,
    finalPackagePath: root,
    requiredAppFilesPresent: appFileFailures === 0,
    requiredTraceFilesPresent: failures.every((failure) => failure.code !== "trace_file_missing"),
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
    hardGatePassed,
    accepted: hardGatePassed,
    acceptanceCriteriaScore,
    runnableAppScore,
    domainFidelityScore,
    packageCompletenessScore,
    traceabilityScore,
    reviewabilityScore,
    qualityScore,
    durationMs: options.durationMs ?? durationFromTaskRun(result),
    validationResult,
    failureCategory: categorizeFailures(failures, result.taskRun.status),
    failures
  };
}

export function summarizeEvalResults(results: EvalCaseResult[]): EvalSummary {
  const passed = results.filter((result) => result.hardGatePassed).length;
  const failureCategories: Record<string, number> = {};
  for (const result of results) {
    failureCategories[result.failureCategory] = (failureCategories[result.failureCategory] ?? 0) + 1;
  }
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    acceptedRuns: results.filter((result) => result.accepted).length,
    averageQualityScore: roundScore(results.reduce((sum, result) => sum + result.qualityScore, 0) / Math.max(1, results.length)),
    p50DurationMs: percentile(results.map((result) => result.durationMs), 50),
    p95DurationMs: percentile(results.map((result) => result.durationMs), 95),
    failureCategories
  };
}

export function computeQualityAdjustedPackagesPerHour(results: EvalCaseResult[], wallClockMs: number): number {
  const acceptedQuality = results
    .filter((result) => result.accepted)
    .reduce((sum, result) => sum + result.qualityScore, 0);
  return roundScore(acceptedQuality / Math.max(wallClockMs / 3_600_000, 1 / 3_600_000));
}

async function readValidationResult(finalPackageDir: string): Promise<ValidationResult | undefined> {
  const summary = await readJsonFile<RunSummary>(finalPackageDir, "trace/run-summary.json");
  return summary?.validationResult;
}

function durationFromTaskRun(result: RunDemoResult): number {
  if (!result.taskRun.completedAt) {
    return 0;
  }
  return Math.max(0, Date.parse(result.taskRun.completedAt) - Date.parse(result.taskRun.startedAt));
}

function categorizeFailures(failures: EvalFailure[], status: string): EvalFailureCategory {
  if (failures.filter((failure) => failure.severity === "error").length === 0) {
    return "none";
  }
  if (failures.some((failure) => failure.code === "secret_leaked")) {
    return "secret_redaction";
  }
  if (failures.some((failure) => failure.code === "command_failed")) {
    return "command";
  }
  if (failures.some((failure) => failure.code === "final_package_file_missing" && failure.path?.startsWith("app/"))) {
    return "missing_app_file";
  }
  if (failures.some((failure) => failure.code === "trace_file_missing")) {
    return "missing_trace_file";
  }
  if (failures.some((failure) => failure.code.includes("validation"))) {
    return "validation";
  }
  if (failures.some((failure) => failure.code.startsWith("context_"))) {
    return "context";
  }
  if (failures.some((failure) => failure.code.startsWith("domain_") || failure.code.includes("phrase") || failure.code.includes("entity") || failure.code.includes("field") || failure.code.includes("status"))) {
    return "domain_mismatch";
  }
  if (status !== "COMPLETED") {
    return "run_status";
  }
  return "runtime";
}

function caseFromDomainSpec(prompt: string, spec: DomainSpec): EvalCase {
  return {
    id: "ad-hoc",
    suite: "smoke",
    difficulty: "smoke",
    prompt,
    expected: {
      appName: spec.appName,
      primaryEntity: spec.primaryEntity.name,
      requiredFields: spec.primaryEntity.fields.filter((field) => field.required).map((field) => field.name),
      requiredStatuses: spec.workflowStatuses,
      requiredArtifacts: ["app/package.json", "app/src/App.tsx", "app/server.js", "app/README.md", "trace/domain-spec.json", "trace/context-eval.json", "trace/run-summary.json"],
      requiredPhrases: [],
      forbiddenPhrases: []
    }
  };
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

function containsText(haystack: string, needle: string): boolean {
  return normalize(haystack).includes(normalize(needle));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function detectsTemplateLeakage(surface: string, expectedAppName: string): boolean {
  const normalizedSurface = normalize(surface);
  const placeholderNeedles = ["{{", "}}", "lorem ipsum", "todo:", "deterministic scaffold", "template placeholder"];
  if (placeholderNeedles.some((needle) => normalizedSurface.includes(needle))) {
    return true;
  }
  return expectedAppName !== "Client Request Tracker" && normalizedSurface.includes("client request tracker");
}

async function detectSecretLeakage(root: string, prompt: string): Promise<boolean> {
  const secrets = prompt.match(/(?:sk|pk|ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9_-]{10,}/g) ?? [];
  if (secrets.length === 0) {
    return false;
  }
  const files = await listFiles(root);
  const contents = await Promise.all(files.map(async (path) => {
    try {
      return await readText(root, path) ?? "";
    } catch {
      return "";
    }
  }));
  return secrets.some((secret) => contents.join("\n").includes(secret));
}

async function listFiles(root: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory() ? listFiles(root, path) : [path];
  }));
  return files.flat();
}

function ratio(total: number, failures: number): number {
  return roundScore(Math.max(0, total - failures) / Math.max(1, total));
}

function roundScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function percentile(values: number[], percentileRank: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((percentileRank / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

const hardGateCodes = new Set([
  "run_status_not_completed",
  "final_package_file_missing",
  "trace_file_missing",
  "validation_result_missing",
  "final_package_validation_failed",
  "command_failed",
  "secret_leaked"
]);
