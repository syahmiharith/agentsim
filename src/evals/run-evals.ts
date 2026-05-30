import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { MockModelProvider } from "../providers/mock-model-provider.js";
import { runOrchestrator } from "../orchestrator.js";
import { scoreEvalRun, summarizeEvalResults } from "./scoring.js";

const prompts = [
  "Build an inventory request system for a flower company",
  "Build a booking system for a barber shop",
  "Build a clinic appointment system",
  "Build a restaurant reservation system",
  "Build an equipment checkout system for a university club",
  "Build a small CRM for a solo consultant",
  "Build a student request portal for a department office",
  "Build a landing page content workflow for a design studio"
];

async function main(): Promise<void> {
  const outputRoot = resolve("outputs", "evals", "runs");
  const reportRoot = resolve("outputs", "evals");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
  const results = [];

  for (const [index, prompt] of prompts.entries()) {
    const runId = `eval-${stamp}-${index + 1}`;
    const startedAt = Date.now();
    try {
      const result = await runOrchestrator({
        goal: prompt,
        outputRoot,
        runId,
        modelProvider: new MockModelProvider()
      });
      results.push(await scoreEvalRun(prompt, runId, result, { durationMs: Date.now() - startedAt }));
    } catch (error) {
      results.push({
        prompt,
        runId,
        status: "FAILED",
        artifactCount: 0,
        finalPackagePath: join(outputRoot, runId, "final-package"),
        requiredAppFilesPresent: false,
        durationMs: Date.now() - startedAt,
        failureCategory: "runtime" as const,
        failures: [error instanceof Error ? error.message : "Unknown eval failure."]
      });
    }
  }

  const summary = summarizeEvalResults(results);
  const report = { generatedAt: new Date().toISOString(), summary, results };
  await mkdir(reportRoot, { recursive: true });
  await writeFile(join(reportRoot, "latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(join(reportRoot, "latest.md"), renderMarkdownReport(report), "utf8");

  console.log(`AgentSim mock evals: ${summary.passed}/${summary.total} passed.`);
  console.log(`Report: ${join(reportRoot, "latest.json")}`);
  if (summary.failed > 0) {
    process.exitCode = 1;
  }
}

function renderMarkdownReport(report: { generatedAt: string; summary: { total: number; passed: number; failed: number }; results: Array<{ prompt: string; runId: string; status: string; artifactCount: number; durationMs: number; failureCategory: string; failures: string[] }> }): string {
  return [
    "# AgentSim Mock Eval Report",
    "",
    `Generated: ${report.generatedAt}`,
    `Passed: ${report.summary.passed}/${report.summary.total}`,
    "",
    "| Prompt | Run ID | Status | Artifacts | Duration | Category | Failures |",
    "| --- | --- | --- | ---: | ---: | --- | --- |",
    ...report.results.map((result) =>
      `| ${escapeCell(result.prompt)} | ${result.runId} | ${result.status} | ${result.artifactCount} | ${result.durationMs}ms | ${result.failureCategory} | ${escapeCell(result.failures.join("; ") || "none")} |`
    ),
    ""
  ].join("\n");
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
