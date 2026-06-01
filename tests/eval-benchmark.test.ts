import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { appSpecFromDomainSpec } from "../src/app-spec/app-spec-from-domain.js";
import { inferDomainSpec } from "../src/domain/mock-domain-spec.js";
import { softwareFreelancePack } from "../src/domain/software-freelance-pack.js";
import { assertFileContains, assertFileNotContains, assertJsonPathEquals, assertJsonPathIncludes } from "../src/evals/assertions.js";
import { loadEvalCases } from "../src/evals/case-loader.js";
import { scoreEvalRun } from "../src/evals/scoring.js";
import { summarizeThroughput } from "../src/evals/run-throughput.js";
import type { DomainSpec } from "../src/domain/domain-spec.js";
import type { EvalCase, EvalFailureCategory } from "../src/evals/types.js";
import type { RunDemoResult } from "../src/orchestrator.js";

describe("eval benchmark harness", () => {
  it("loads smoke cases from JSON files", async () => {
    const smoke = await loadEvalCases("smoke");
    const domain = await loadEvalCases("domain");

    expect(smoke).toHaveLength(8);
    expect(smoke[0]).toMatchObject({
      id: "smoke-flower-inventory",
      expected: { appName: "Inventory Request Desk", primaryEntity: "Inventory Request" },
    });
    expect(domain.length).toBeGreaterThan(0);
  });

  it("returns structured assertion failures for phrases and JSON paths", async () => {
    const root = await createTempRoot();
    await writeFixtureFile(root, "app/src/App.tsx", "Inventory Request Desk has Pending requests.");

    expect(await assertFileContains(root, "app/src/App.tsx", ["Inventory Request Desk"])).toEqual([]);
    expect(await assertFileNotContains(root, "app/src/App.tsx", ["Pending"])).toEqual([
      expect.objectContaining({ code: "forbidden_phrase_present", severity: "error" }),
    ]);
    expect(assertJsonPathEquals({ app: { name: "Desk" } }, "app.name", "Desk")).toEqual([]);
    expect(assertJsonPathIncludes({ app: { statuses: ["Pending"] } }, "app.statuses", "Pending")).toEqual([]);
  });

  it("keeps duration out of the quality score", async () => {
    const spec = inferDomainSpec("Build an inventory request system for a flower company");
    const evalCase = createEvalCase(spec);
    const fast = await scoreEvalRun(evalCase, "fast", await createEvalFixture(spec), { durationMs: 10 });
    const slow = await scoreEvalRun(evalCase, "slow", await createEvalFixture(spec), { durationMs: 10_000 });

    expect(fast.hardGatePassed).toBe(true);
    expect(fast.qualityScore).toBe(1);
    expect(slow.qualityScore).toBe(fast.qualityScore);
  });

  it("classifies required command failures as command hard-gate failures", async () => {
    const spec = inferDomainSpec("Build a restaurant reservation system");
    const evalCase = createEvalCase(spec, {
      commands: [{ command: 'node -e "process.exit(2)"', cwd: ".", timeoutMs: 5_000 }],
    });
    const result = await scoreEvalRun(evalCase, "command-run", await createEvalFixture(spec), { durationMs: 1 });

    expect(result.hardGatePassed).toBe(false);
    expect(result.failureCategory).toBe("command");
    expect(result.failures).toEqual([expect.objectContaining({ code: "command_failed", severity: "error" })]);
  });

  it("calculates throughput summaries from accepted quality", () => {
    const accepted = resultStub({ accepted: true, hardGatePassed: true, qualityScore: 0.9, durationMs: 100, failureCategory: "none" });
    const rejected = resultStub({ accepted: false, hardGatePassed: false, qualityScore: 1, durationMs: 300, failureCategory: "command" });

    expect(summarizeThroughput([accepted, rejected], 1_800_000, 2)).toEqual({
      totalRuns: 2,
      acceptedRuns: 1,
      acceptanceRate: 0.5,
      wallClockMs: 1_800_000,
      p50DurationMs: 100,
      p95DurationMs: 300,
      qualityAdjustedPackagesPerHour: 1.8,
      retries: 2,
      failureCategories: { none: 1, command: 1 },
    });
  });
});

async function createEvalFixture(spec: DomainSpec): Promise<RunDemoResult> {
  const finalPackageDir = await createTempRoot();
  for (const relativePath of softwareFreelancePack.requiredFinalPackageFiles) {
    await writeFixtureFile(finalPackageDir, relativePath, contentFor(relativePath, spec));
  }
  await writeFixtureFile(finalPackageDir, `app/data/${spec.primaryEntity.slug}.json`, `${JSON.stringify(spec.seedRecords, null, 2)}\n`);
  for (const relativePath of softwareFreelancePack.requiredTraceFiles) {
    await writeFixtureFile(finalPackageDir, relativePath, traceContentFor(relativePath, spec));
  }
  await writeFixtureFile(
    finalPackageDir,
    "trace/run-summary.json",
    JSON.stringify(
      {
        runId: "run",
        goal: spec.sourceGoal,
        status: "COMPLETED",
        modelMode: "mock",
        provider: "deterministic-mock",
        finalPackageDir,
        artifactCount: 1,
        validationResult: { ok: true, failures: [] },
        failures: [],
      },
      null,
      2,
    ),
  );
  return {
    taskRun: {
      id: "run",
      goal: spec.sourceGoal,
      startedAt: "2026-05-31T00:00:00.000Z",
      completedAt: "2026-05-31T00:00:01.000Z",
      status: "COMPLETED",
      modelMode: "mock",
      outputDir: finalPackageDir,
    },
    finalPackageDir,
    artifacts: [],
    decisions: [],
    domainSpec: spec,
    appSpec: appSpecFromDomainSpec(spec),
  };
}

function createEvalCase(spec: DomainSpec, overrides: Partial<EvalCase["expected"]> = {}): EvalCase {
  return {
    id: "case",
    suite: "smoke",
    difficulty: "smoke",
    prompt: spec.sourceGoal,
    expected: {
      appName: spec.appName,
      primaryEntity: spec.primaryEntity.name,
      requiredFields: spec.primaryEntity.fields.filter((field) => field.required).map((field) => field.name),
      requiredStatuses: spec.workflowStatuses,
      requiredArtifacts: [
        "app/package.json",
        "app/src/App.tsx",
        "app/server.js",
        "app/README.md",
        "trace/domain-spec.json",
        "trace/context-eval.json",
        "trace/run-summary.json",
      ],
      requiredPhrases: [{ path: "app/src/App.tsx", terms: [spec.appName, spec.primaryEntity.fields[0].name, spec.workflowStatuses[0]] }],
      forbiddenPhrases: [],
      ...overrides,
    },
  };
}

function contentFor(relativePath: string, spec: DomainSpec): string {
  if (relativePath === "app/src/App.tsx") {
    return renderAppSource(spec);
  }
  if (relativePath === "app/package.json") {
    return JSON.stringify({ name: spec.appSlug }, null, 2);
  }
  if (relativePath === "app/server.js") {
    return renderServerSource();
  }
  if (relativePath.startsWith("review/")) {
    if (relativePath === "review/qa-report.md") {
      return `# QA Report\n\n## Generated App Validation\n\n${spec.appName} passed.`;
    }
    if (relativePath === "review/code-review.md") {
      return `# Code Review\n\n## Findings\n\n${spec.appName} keeps ${spec.primaryEntity.name} simple.`;
    }
    return `# Known Issues\n\nNo blocking issues for ${spec.appName}.`;
  }
  return `# ${spec.appName}\n\n${spec.primaryEntity.name} ${spec.primaryEntity.fields.map((field) => `${field.name} ${field.label}`).join(" ")} ${spec.workflowStatuses.join(" ")}`;
}

function traceContentFor(relativePath: string, spec: DomainSpec): string {
  if (relativePath === "trace/domain-spec.json") {
    return JSON.stringify(spec, null, 2);
  }
  if (relativePath === "trace/context-eval.json") {
    return JSON.stringify({ evaluation: { requiredCoverageOk: true, provenanceOk: true, failures: [] } }, null, 2);
  }
  if (relativePath === "trace/app-spec.json") {
    return JSON.stringify(appSpecFromDomainSpec(spec), null, 2);
  }
  if (relativePath === "trace/events.jsonl") {
    return `${JSON.stringify({ name: "run.completed" })}\n`;
  }
  return JSON.stringify({ actions: [], approvals: [], contextPackages: [], decisions: [], messages: [], artifacts: [] }, null, 2);
}

async function createTempRoot(): Promise<string> {
  const root = join(tmpdir(), `agentsim-eval-benchmark-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(root, { recursive: true });
  return root;
}

async function writeFixtureFile(root: string, relativePath: string, content: string): Promise<void> {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

function renderAppSource(spec: DomainSpec): string {
  return `export const appConfig = ${JSON.stringify(
    {
      appName: spec.appName,
      primaryEntityName: spec.primaryEntity.name,
      fields: spec.primaryEntity.fields.map((field) => ({ name: field.name, label: field.label })),
      statuses: spec.workflowStatuses,
    },
    null,
    2,
  )};`;
}

function renderServerSource(): string {
  return `
const config = { entitySlug: "requests", collectionKey: "requests", fields: [], statuses: [] };
const statuses = new Set(config.statuses);
function validate(body) {
  for (const field of config.fields) {
    if (field.required && !body[field.name]) return field.label + " is required.";
  }
  return undefined;
}
createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:4178");
  if (request.method === "GET" && url.pathname === "/api/health") return;
  if (request.method === "GET" && url.pathname === "/api/" + config.entitySlug) return;
  if (request.method === "POST" && url.pathname === "/api/" + config.entitySlug) {
    const validationError = validate(body);
    return;
  }
  const statusMatch = url.pathname.match(new RegExp("^/api/" + config.entitySlug + "/([^/]+)/status$"));
  if (request.method === "PATCH" && statusMatch) {
    if (!statuses.has(body.status)) return "Unknown status";
  }
});
`;
}

function resultStub(overrides: { accepted: boolean; hardGatePassed: boolean; qualityScore: number; durationMs: number; failureCategory: EvalFailureCategory }) {
  return {
    caseId: "case",
    suite: "smoke",
    difficulty: "smoke",
    prompt: "prompt",
    runId: "run",
    status: overrides.hardGatePassed ? "COMPLETED" : "FAILED",
    artifactCount: 0,
    finalPackagePath: "final-package",
    requiredAppFilesPresent: overrides.hardGatePassed,
    requiredTraceFilesPresent: overrides.hardGatePassed,
    finalValidationOk: overrides.hardGatePassed,
    contextCoverageOk: overrides.hardGatePassed,
    contextProvenanceOk: overrides.hardGatePassed,
    domainSpecPresent: overrides.hardGatePassed,
    domainInferencePresent: false,
    domainMatchedPresetId: undefined,
    domainInferenceConfidence: undefined,
    domainFallbackUsed: undefined,
    domainNeedsClarification: undefined,
    appNameAppearsInApp: overrides.hardGatePassed,
    primaryEntityAppearsInApp: overrides.hardGatePassed,
    workflowStatusesAppearInApp: overrides.hardGatePassed,
    requiredFieldsAppearInApp: overrides.hardGatePassed,
    promptLeakageDetected: false,
    templateLeakageDetected: false,
    apiBehaviorPresent: overrides.hardGatePassed,
    seedDataPresent: overrides.hardGatePassed,
    commandChecksPassed: overrides.hardGatePassed,
    commandChecksRun: 0,
    requiredCommandChecksRun: 0,
    warningCount: 0,
    errorCount: overrides.hardGatePassed ? 0 : 1,
    hardGatePassed: overrides.hardGatePassed,
    accepted: overrides.accepted,
    acceptanceCriteriaScore: overrides.qualityScore,
    runnableAppScore: overrides.qualityScore,
    domainFidelityScore: overrides.qualityScore,
    packageCompletenessScore: overrides.qualityScore,
    traceabilityScore: overrides.qualityScore,
    reviewabilityScore: overrides.qualityScore,
    qualityScore: overrides.qualityScore,
    durationMs: overrides.durationMs,
    failureCategory: overrides.failureCategory,
    failures: [],
  };
}
