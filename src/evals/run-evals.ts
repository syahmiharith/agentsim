import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "../config.js";
import { runOrchestrator } from "../orchestrator.js";
import { createModelProvider } from "../providers/index.js";
import { loadEvalCases } from "./case-loader.js";
import { scoreEvalRun, summarizeEvalResults, type EvalCaseResult, type EvalSummary } from "./scoring.js";
import type { EvalAdapter, EvalCase, EvalFailure, EvalMode, EvalSuite } from "./types.js";

export interface EvalRunnerOptions {
  suite: EvalSuite | "all";
  mode: EvalMode;
  output: string;
  repeat: number;
  concurrency: number;
  adapter: EvalAdapter;
}

export interface EvalReport {
  generatedAt: string;
  options: EvalRunnerOptions;
  summary: EvalSummary;
  results: EvalCaseResult[];
}

export async function runEvalBatch(options: EvalRunnerOptions): Promise<EvalReport> {
  if (options.adapter !== "agentsim") {
    throw new Error(`Unsupported eval adapter: ${options.adapter}`);
  }
  const cases = expandRepeats(await loadEvalCases(options.suite), options.repeat);
  const outputRoot = resolve(options.output, "runs");
  const startedAt = Date.now();
  const results = await runWithConcurrency(cases, Math.max(1, options.concurrency), async ({ evalCase, repeatIndex, caseIndex }) => {
    const runId = createEvalRunId(evalCase, repeatIndex, caseIndex);
    const runStartedAt = Date.now();
    try {
      const result = await runOrchestrator({
        goal: evalCase.prompt,
        outputRoot,
        runId,
        modelProvider: createModelProvider(options.mode)
      });
      return await scoreEvalRun(evalCase, runId, result, { durationMs: Date.now() - runStartedAt });
    } catch (error) {
      return createRuntimeFailure(evalCase, runId, join(outputRoot, runId, "final-package"), Date.now() - runStartedAt, error);
    }
  });

  const report = {
    generatedAt: new Date().toISOString(),
    options,
    summary: summarizeEvalResults(results),
    results: results.sort((left, right) => left.caseId.localeCompare(right.caseId) || left.runId.localeCompare(right.runId))
  };
  await writeReports(resolve(options.output), report, Date.now() - startedAt);
  return report;
}

function parseArgs(argv: string[]): EvalRunnerOptions {
  const options: EvalRunnerOptions = {
    suite: "smoke",
    mode: "mock",
    output: "outputs/evals",
    repeat: 1,
    concurrency: 1,
    adapter: "agentsim"
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    switch (arg) {
      case "--suite":
        options.suite = readChoice(next, ["smoke", "domain", "all"], "--suite") as EvalRunnerOptions["suite"];
        index += 1;
        break;
      case "--mode":
        options.mode = readChoice(next, ["mock", "live"], "--mode") as EvalMode;
        index += 1;
        break;
      case "--output":
        options.output = readValue(next, "--output");
        index += 1;
        break;
      case "--repeat":
        options.repeat = readPositiveInteger(next, "--repeat");
        index += 1;
        break;
      case "--concurrency":
        options.concurrency = readPositiveInteger(next, "--concurrency");
        index += 1;
        break;
      case "--adapter":
        options.adapter = readChoice(next, ["agentsim"], "--adapter") as EvalAdapter;
        index += 1;
        break;
      default:
        throw new Error(`Unknown eval option: ${arg}`);
    }
  }
  return options;
}

async function writeReports(reportRoot: string, report: EvalReport, wallClockMs: number): Promise<void> {
  await mkdir(reportRoot, { recursive: true });
  await writeFile(join(reportRoot, "latest.json"), `${JSON.stringify({ ...report, wallClockMs }, null, 2)}\n`, "utf8");
  await writeFile(join(reportRoot, "latest.md"), renderMarkdownReport(report), "utf8");
  await writeFile(join(reportRoot, "latest.csv"), renderCsvReport(report), "utf8");
}

function renderMarkdownReport(report: EvalReport): string {
  const breakdown = Object.entries(report.summary.failureCategories)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, count]) => `- ${category}: ${count}`)
    .join("\n");
  return [
    "# AgentSim Eval Report",
    "",
    `Generated: ${report.generatedAt}`,
    `Suite: ${report.options.suite}`,
    `Mode: ${report.options.mode}`,
    `Adapter: ${report.options.adapter}`,
    "",
    "## Summary",
    "",
    `Pass/fail: ${report.summary.passed}/${report.summary.total} passed`,
    `Average quality score: ${report.summary.averageQualityScore.toFixed(3)}`,
    `Accepted runs: ${report.summary.acceptedRuns}`,
    `p50 duration: ${report.summary.p50DurationMs}ms`,
    `p95 duration: ${report.summary.p95DurationMs}ms`,
    "",
    "## Failure Categories",
    "",
    breakdown || "- none: 0",
    "",
    "## Case Results",
    "",
    "| Case | Run ID | Hard Gate | Quality | Duration | Category | Failures |",
    "| --- | --- | --- | ---: | ---: | --- | --- |",
    ...report.results.map((result) =>
      `| ${escapeCell(result.caseId)} | ${result.runId} | ${result.hardGatePassed ? "pass" : "fail"} | ${result.qualityScore.toFixed(3)} | ${result.durationMs}ms | ${result.failureCategory} | ${escapeCell(result.failures.map((item) => item.message).join("; ") || "none")} |`
    ),
    ""
  ].join("\n");
}

function renderCsvReport(report: EvalReport): string {
  const rows = [
    ["caseId", "suite", "difficulty", "runId", "hardGatePassed", "accepted", "qualityScore", "durationMs", "failureCategory", "failureCount", "prompt"],
    ...report.results.map((result) => [
      result.caseId,
      result.suite,
      result.difficulty,
      result.runId,
      String(result.hardGatePassed),
      String(result.accepted),
      result.qualityScore.toFixed(3),
      String(result.durationMs),
      result.failureCategory,
      String(result.failures.length),
      result.prompt
    ])
  ];
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function expandRepeats(cases: EvalCase[], repeat: number): Array<{ evalCase: EvalCase; repeatIndex: number; caseIndex: number }> {
  return Array.from({ length: repeat }, (_, repeatIndex) =>
    cases.map((evalCase, caseIndex) => ({ evalCase, repeatIndex, caseIndex }))
  ).flat();
}

async function runWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  }));
  return results;
}

function createRuntimeFailure(evalCase: EvalCase, runId: string, finalPackagePath: string, durationMs: number, error: unknown): EvalCaseResult {
  const failures: EvalFailure[] = [{
    code: "runtime_error",
    message: error instanceof Error ? error.message : "Unknown eval failure.",
    severity: "error"
  }];
  return {
    caseId: evalCase.id,
    suite: evalCase.suite,
    difficulty: evalCase.difficulty,
    prompt: evalCase.prompt,
    runId,
    status: "FAILED",
    artifactCount: 0,
    finalPackagePath,
    requiredAppFilesPresent: false,
    requiredTraceFilesPresent: false,
    finalValidationOk: false,
    contextCoverageOk: false,
    contextProvenanceOk: false,
    domainSpecPresent: false,
    appNameAppearsInApp: false,
    primaryEntityAppearsInApp: false,
    workflowStatusesAppearInApp: false,
    requiredFieldsAppearInApp: false,
    promptLeakageDetected: false,
    templateLeakageDetected: false,
    hardGatePassed: false,
    accepted: false,
    acceptanceCriteriaScore: 0,
    runnableAppScore: 0,
    domainFidelityScore: 0,
    packageCompletenessScore: 0,
    traceabilityScore: 0,
    reviewabilityScore: 0,
    qualityScore: 0,
    durationMs,
    failureCategory: "runtime",
    failures
  };
}

function createEvalRunId(evalCase: EvalCase, repeatIndex: number, caseIndex: number): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
  const repeat = repeatIndex > 0 ? `-r${repeatIndex + 1}` : "";
  return `eval-${stamp}-${caseIndex + 1}-${evalCase.id}${repeat}`;
}

function readChoice(value: string | undefined, choices: string[], flag: string): string {
  const actual = readValue(value, flag);
  if (!choices.includes(actual)) {
    throw new Error(`${flag} must be one of: ${choices.join(", ")}`);
  }
  return actual;
}

function readValue(value: string | undefined, flag: string): string {
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function readPositiveInteger(value: string | undefined, flag: string): number {
  const parsed = Number.parseInt(readValue(value, flag), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return parsed;
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function isMain(): boolean {
  return process.argv[1] ? resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}

if (isMain()) {
  loadDotEnv();
  runEvalBatch(parseArgs(process.argv.slice(2))).then((report) => {
    console.log(`AgentSim evals: ${report.summary.passed}/${report.summary.total} passed.`);
    console.log(`Average quality score: ${report.summary.averageQualityScore.toFixed(3)}`);
    console.log(`Report: ${resolve(report.options.output, "latest.json")}`);
    if (report.summary.failed > 0) {
      process.exitCode = 1;
    }
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
