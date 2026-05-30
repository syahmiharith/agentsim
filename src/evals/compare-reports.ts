import { readFile } from "node:fs/promises";
import { compareEvalReports, type EvalReportComparison } from "./report-compare.js";
import type { EvalReport } from "./run-evals.js";

interface CompareOptions {
  base: string;
  head: string;
  qualityRegressionThreshold: number;
}

export async function compareEvalReportFiles(options: CompareOptions): Promise<EvalReportComparison> {
  const base = await readEvalReport(options.base, "base");
  const head = await readEvalReport(options.head, "head");
  return compareEvalReports(base, head, { qualityRegressionThreshold: options.qualityRegressionThreshold });
}

export function renderEvalReportComparison(comparison: EvalReportComparison): string {
  const failureCategoryChanges = Object.entries(comparison.failureCategoryChanges)
    .map(([category, change]) => `- ${category}: ${change.base} -> ${change.head} (${formatDelta(change.delta)})`)
    .join("\n");
  const hardGateRegressions = comparison.hardGateRegressions
    .map((regression) => `- ${regression.caseId}: ${regression.baseRunId} -> ${regression.headRunId}`)
    .join("\n");
  const qualityRegressions = comparison.qualityRegressions
    .map((regression) => `- ${regression.caseId}: ${regression.baseQualityScore.toFixed(3)} -> ${regression.headQualityScore.toFixed(3)} (${formatDelta(regression.delta)})`)
    .join("\n");

  return [
    "# AgentSim Eval Report Comparison",
    "",
    `Accepted run delta: ${formatDelta(comparison.acceptedRunDelta)}`,
    `Average quality delta: ${formatDelta(comparison.averageQualityDelta)}`,
    "",
    "## Hard Gate Regressions",
    "",
    hardGateRegressions || "- none",
    "",
    "## Quality Regressions",
    "",
    qualityRegressions || "- none",
    "",
    "## Failure Category Changes",
    "",
    failureCategoryChanges || "- none",
    ""
  ].join("\n");
}

async function main(argv: string[]): Promise<void> {
  const options = parseArgs(argv);
  const comparison = await compareEvalReportFiles(options);
  console.log(renderEvalReportComparison(comparison));
  if (comparison.hardGateRegressions.length > 0) {
    process.exitCode = 1;
  }
}

function parseArgs(argv: string[]): CompareOptions {
  const options: Partial<CompareOptions> = {
    qualityRegressionThreshold: 0.05
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    switch (arg) {
      case "--base":
        options.base = readValue(next, "--base");
        index += 1;
        break;
      case "--head":
        options.head = readValue(next, "--head");
        index += 1;
        break;
      case "--quality-threshold":
        options.qualityRegressionThreshold = Number(readValue(next, "--quality-threshold"));
        if (!Number.isFinite(options.qualityRegressionThreshold) || options.qualityRegressionThreshold < 0) {
          throw new Error("--quality-threshold must be a non-negative number.");
        }
        index += 1;
        break;
      default:
        throw new Error(`Unknown eval compare option: ${arg}`);
    }
  }
  if (!options.base) {
    throw new Error("Missing required option: --base");
  }
  if (!options.head) {
    throw new Error("Missing required option: --head");
  }
  return options as CompareOptions;
}

function readValue(value: string | undefined, flag: string): string {
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

async function readEvalReport(path: string, label: string): Promise<EvalReport> {
  const report = JSON.parse(await readFile(path, "utf8")) as EvalReport;
  if (report.schemaVersion !== 1) {
    throw new Error(`${label} report has unsupported schemaVersion: ${String(report.schemaVersion)}`);
  }
  if (!Array.isArray(report.results) || !report.summary) {
    throw new Error(`${label} report is missing eval results or summary.`);
  }
  return report;
}

function formatDelta(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

if (process.argv[1]?.endsWith("compare-reports.ts") || process.argv[1]?.endsWith("compare-reports.js")) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
