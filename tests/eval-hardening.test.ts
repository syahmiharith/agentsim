import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { inferDomainSpec } from "../src/domain/mock-domain-spec.js";
import { renderGeneratedAppFiles } from "../src/templates/app.js";
import { assertCommandPasses, assertGeneratedApiBehavior } from "../src/evals/assertions.js";
import { compareEvalReports } from "../src/evals/report-compare.js";
import { runEvalBatch, type EvalReport } from "../src/evals/run-evals.js";
import type { EvalCaseResult } from "../src/evals/scoring.js";
import type { EvalFailureCategory } from "../src/evals/types.js";

describe("eval hardening assertions", () => {
  it("runs safe commands and rejects shell syntax", async () => {
    const root = await createTempRoot();

    expect(await assertCommandPasses(root, { command: "node --version", cwd: ".", timeoutMs: 5_000 })).toEqual([]);
    expect(await assertCommandPasses(root, { command: "node --version && echo hi", cwd: ".", timeoutMs: 5_000 })).toEqual([
      expect.objectContaining({ code: "command_unsupported_syntax", severity: "error" })
    ]);
  });

  it("classifies timeout and optional command failures", async () => {
    const root = await createTempRoot();

    expect(await assertCommandPasses(root, { command: "node -e \"setTimeout(function(){},1000)\"", cwd: ".", timeoutMs: 25 })).toEqual([
      expect.objectContaining({ code: "command_failed", severity: "error", actual: expect.objectContaining({ timedOut: true }) })
    ]);
    expect(await assertCommandPasses(root, { command: "node -e \"process.exit(2)\"", cwd: ".", timeoutMs: 5_000, optional: true })).toEqual([
      expect.objectContaining({ code: "command_failed", severity: "warn" })
    ]);
  });

  it("checks generated API behavior and seed data statically", async () => {
    const spec = inferDomainSpec("Build an inventory request system for a flower company");
    const root = await createGeneratedAppRoot(spec.sourceGoal);

    expect(await assertGeneratedApiBehavior(root, spec.primaryEntity.slug, spec.workflowStatuses)).toEqual([]);
  });

  it("reports missing API behavior and invalid seed data", async () => {
    const spec = inferDomainSpec("Build a booking system for a barber shop");
    const root = await createGeneratedAppRoot(spec.sourceGoal);
    await writeFixtureFile(root, "app/server.js", "export {};\n");
    await writeFixtureFile(root, `app/data/${spec.primaryEntity.slug}.json`, "{");

    expect(await assertGeneratedApiBehavior(root, spec.primaryEntity.slug, spec.workflowStatuses)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "api_health_missing" }),
      expect.objectContaining({ code: "api_list_missing" }),
      expect.objectContaining({ code: "api_create_missing" }),
      expect.objectContaining({ code: "api_status_update_missing" }),
      expect.objectContaining({ code: "seed_data_invalid" })
    ]));
  });
});

describe("eval runner reports", () => {
  it("writes stable JSON, Markdown, and CSV report outputs in mock mode", async () => {
    const output = await createTempRoot();
    const report = await runEvalBatch({
      suite: "smoke",
      mode: "mock",
      output,
      repeat: 1,
      concurrency: 1,
      adapter: "agentsim"
    });

    expect(report.schemaVersion).toBe(1);
    expect(report.generatedAt).toBeTruthy();
    expect(report.environment.nodeVersion).toBe(process.version);
    expect(report.summary.total).toBeGreaterThan(0);
    expect(report.results).toHaveLength(report.summary.total);
    expect(report.results).toEqual([...report.results].sort((left, right) => left.caseId.localeCompare(right.caseId) || left.runId.localeCompare(right.runId)));
    expect(report.results.some((result) => result.commandChecksRun > 0)).toBe(true);
    expect(report.results.every((result) =>
      result.caseId &&
      result.runId &&
      typeof result.qualityScore === "number" &&
      typeof result.durationMs === "number" &&
      result.failureCategory
    )).toBe(true);
    await expect(readFile(join(output, "latest.json"), "utf8")).resolves.toContain("\"schemaVersion\": 1");
    await expect(readFile(join(output, "latest.md"), "utf8")).resolves.toContain("Command checks:");
    await expect(readFile(join(output, "latest.csv"), "utf8")).resolves.toContain("apiBehaviorPresent");
  }, 30_000);
});

describe("eval report comparison", () => {
  it("detects hard-gate, quality, and failure-category regressions", () => {
    const base = createReport([
      resultStub({ caseId: "a", hardGatePassed: true, accepted: true, qualityScore: 1, failureCategory: "none" }),
      resultStub({ caseId: "b", hardGatePassed: true, accepted: true, qualityScore: 0.9, failureCategory: "none" })
    ]);
    const head = createReport([
      resultStub({ caseId: "a", hardGatePassed: false, accepted: false, qualityScore: 0.7, failureCategory: "api_behavior" }),
      resultStub({ caseId: "b", hardGatePassed: true, accepted: true, qualityScore: 0.89, failureCategory: "none" })
    ]);

    expect(compareEvalReports(base, head, { qualityRegressionThreshold: 0.05 })).toEqual({
      acceptedRunDelta: -1,
      averageQualityDelta: -0.155,
      failureCategoryChanges: {
        api_behavior: { base: 0, head: 1, delta: 1 },
        none: { base: 2, head: 1, delta: -1 }
      },
      hardGateRegressions: [{ caseId: "a", baseRunId: "run-a", headRunId: "run-a" }],
      qualityRegressions: [{ caseId: "a", baseQualityScore: 1, headQualityScore: 0.7, delta: -0.3 }]
    });
  });
});

describe("generated app regression coverage", () => {
  it("renders API routes, seed data, fields, statuses, and run commands", () => {
    const spec = inferDomainSpec("Build an equipment checkout system for a university club");
    const files = renderGeneratedAppFiles({ runId: "test-run" }, spec);
    const server = files["app/server.js"];
    const app = files["app/src/App.tsx"];
    const readme = files["app/README.md"];
    const seedData = JSON.parse(files[`app/data/${spec.primaryEntity.slug}.json`]);

    expect(server).toContain("/api/health");
    expect(server).toContain('request.method === "POST"');
    expect(server).toContain("/([^/]+)/status");
    expect(seedData.length).toBeGreaterThan(0);
    expect(app).toContain("equipmentItem");
    expect(app).toContain("Overdue");
    expect(readme).toContain("pnpm dev:api");
    expect(readme).toContain("pnpm dev:web");
  });
});

async function createGeneratedAppRoot(goal: string): Promise<string> {
  const spec = inferDomainSpec(goal);
  const root = await createTempRoot();
  const files = renderGeneratedAppFiles({ runId: "test-run" }, spec);
  for (const [relativePath, content] of Object.entries(files)) {
    await writeFixtureFile(root, relativePath, content);
  }
  return root;
}

async function createTempRoot(): Promise<string> {
  const root = join(tmpdir(), `agentsim-eval-hardening-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(root, { recursive: true });
  return root;
}

async function writeFixtureFile(root: string, relativePath: string, content: string): Promise<void> {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

function createReport(results: EvalCaseResult[]): EvalReport {
  const acceptedRuns = results.filter((result) => result.accepted).length;
  const averageQualityScore = Math.round((results.reduce((sum, result) => sum + result.qualityScore, 0) / results.length) * 1000) / 1000;
  const failureCategories: Record<string, number> = {};
  for (const result of results) {
    failureCategories[result.failureCategory] = (failureCategories[result.failureCategory] ?? 0) + 1;
  }
  return {
    schemaVersion: 1,
    generatedAt: "2026-05-31T00:00:00.000Z",
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      agentSimVersion: "0.1.0"
    },
    options: {
      suite: "smoke",
      mode: "mock",
      output: "outputs/evals",
      repeat: 1,
      concurrency: 1,
      adapter: "agentsim"
    },
    summary: {
      total: results.length,
      passed: acceptedRuns,
      failed: results.length - acceptedRuns,
      acceptedRuns,
      averageQualityScore,
      p50DurationMs: 1,
      p95DurationMs: 1,
      failureCategories,
      totalWarnings: 0,
      totalErrors: results.reduce((sum, result) => sum + result.errorCount, 0),
      commandChecksRun: 0,
      requiredCommandChecksRun: 0,
      commandChecksPassed: results.filter((result) => result.commandChecksPassed).length,
      averageCommandChecksPerCase: 0
    },
    results
  };
}

function resultStub(input: { caseId: string; hardGatePassed: boolean; accepted: boolean; qualityScore: number; failureCategory: EvalFailureCategory }): EvalCaseResult {
  return {
    caseId: input.caseId,
    suite: "smoke",
    difficulty: "smoke",
    prompt: "prompt",
    runId: `run-${input.caseId}`,
    status: input.hardGatePassed ? "COMPLETED" : "FAILED",
    artifactCount: 1,
    finalPackagePath: "final-package",
    requiredAppFilesPresent: input.hardGatePassed,
    requiredTraceFilesPresent: input.hardGatePassed,
    finalValidationOk: input.hardGatePassed,
    contextCoverageOk: input.hardGatePassed,
    contextProvenanceOk: input.hardGatePassed,
    domainSpecPresent: input.hardGatePassed,
    domainInferencePresent: false,
    domainMatchedPresetId: undefined,
    domainInferenceConfidence: undefined,
    domainFallbackUsed: undefined,
    domainNeedsClarification: undefined,
    appNameAppearsInApp: input.hardGatePassed,
    primaryEntityAppearsInApp: input.hardGatePassed,
    workflowStatusesAppearInApp: input.hardGatePassed,
    requiredFieldsAppearInApp: input.hardGatePassed,
    promptLeakageDetected: false,
    templateLeakageDetected: false,
    apiBehaviorPresent: input.hardGatePassed,
    seedDataPresent: input.hardGatePassed,
    commandChecksPassed: input.hardGatePassed,
    commandChecksRun: 0,
    requiredCommandChecksRun: 0,
    warningCount: 0,
    errorCount: input.hardGatePassed ? 0 : 1,
    hardGatePassed: input.hardGatePassed,
    accepted: input.accepted,
    acceptanceCriteriaScore: input.qualityScore,
    runnableAppScore: input.qualityScore,
    domainFidelityScore: input.qualityScore,
    packageCompletenessScore: input.qualityScore,
    traceabilityScore: input.qualityScore,
    reviewabilityScore: input.qualityScore,
    qualityScore: input.qualityScore,
    durationMs: 1,
    failureCategory: input.failureCategory,
    failures: []
  };
}
