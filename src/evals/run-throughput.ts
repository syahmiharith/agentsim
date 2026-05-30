import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDotEnv } from "../config.js";
import { runEvalBatch, type EvalRunnerOptions } from "./run-evals.js";
import type { EvalCaseResult } from "./scoring.js";
import type { EvalAdapter, EvalMode, EvalSuite, ThroughputSummary } from "./types.js";

export function summarizeThroughput(results: EvalCaseResult[], wallClockMs: number, retries = 0): ThroughputSummary {
  const acceptedRuns = results.filter((result) => result.accepted).length;
  const failureCategories: Record<string, number> = {};
  for (const result of results) {
    failureCategories[result.failureCategory] = (failureCategories[result.failureCategory] ?? 0) + 1;
  }
  const qualityAdjustedAccepted = results
    .filter((result) => result.accepted)
    .reduce((sum, result) => sum + result.qualityScore, 0);
  return {
    totalRuns: results.length,
    acceptedRuns,
    acceptanceRate: round(acceptedRuns / Math.max(1, results.length)),
    wallClockMs,
    p50DurationMs: percentile(results.map((result) => result.durationMs), 50),
    p95DurationMs: percentile(results.map((result) => result.durationMs), 95),
    qualityAdjustedPackagesPerHour: round(qualityAdjustedAccepted / Math.max(wallClockMs / 3_600_000, 1 / 3_600_000)),
    retries,
    failureCategories
  };
}

function parseArgs(argv: string[]): EvalRunnerOptions {
  const options: EvalRunnerOptions = {
    suite: "smoke",
    mode: "mock",
    output: "outputs/evals",
    repeat: 3,
    concurrency: 4,
    adapter: "agentsim"
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    switch (arg) {
      case "--suite":
        options.suite = readChoice(next, ["smoke", "domain", "all"], "--suite") as EvalSuite | "all";
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
        throw new Error(`Unknown throughput option: ${arg}`);
    }
  }
  return options;
}

async function writeThroughputReport(output: string, summary: ThroughputSummary): Promise<void> {
  const root = resolve(output);
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "throughput-latest.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await writeFile(join(root, "throughput-latest.md"), renderMarkdown(summary), "utf8");
}

function renderMarkdown(summary: ThroughputSummary): string {
  const categories = Object.entries(summary.failureCategories)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, count]) => `- ${category}: ${count}`)
    .join("\n");
  return [
    "# AgentSim Throughput Report",
    "",
    `Total runs: ${summary.totalRuns}`,
    `Accepted runs: ${summary.acceptedRuns}`,
    `Acceptance rate: ${(summary.acceptanceRate * 100).toFixed(1)}%`,
    `Wall clock: ${summary.wallClockMs}ms`,
    `p50 duration: ${summary.p50DurationMs}ms`,
    `p95 duration: ${summary.p95DurationMs}ms`,
    `Quality-adjusted packages/hour: ${summary.qualityAdjustedPackagesPerHour.toFixed(3)}`,
    summary.costPerAcceptedPackageUsd === undefined ? "" : `Cost per accepted package: $${summary.costPerAcceptedPackageUsd.toFixed(4)}`,
    `Retries: ${summary.retries}`,
    "",
    "## Failure Categories",
    "",
    categories || "- none: 0",
    ""
  ].filter((line) => line !== "").join("\n");
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

function percentile(values: number[], percentileRank: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((percentileRank / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isMain(): boolean {
  return process.argv[1] ? resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false;
}

if (isMain()) {
  loadDotEnv();
  const options = parseArgs(process.argv.slice(2));
  const startedAt = Date.now();
  runEvalBatch(options).then(async (report) => {
    const summary = summarizeThroughput(report.results, Date.now() - startedAt);
    await writeThroughputReport(options.output, summary);
    console.log(`AgentSim throughput: ${summary.acceptedRuns}/${summary.totalRuns} accepted.`);
    console.log(`Quality-adjusted packages/hour: ${summary.qualityAdjustedPackagesPerHour.toFixed(3)}`);
    console.log(`Report: ${resolve(options.output, "throughput-latest.json")}`);
    if (summary.acceptedRuns < summary.totalRuns) {
      process.exitCode = 1;
    }
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
