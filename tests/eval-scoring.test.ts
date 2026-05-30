import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { inferDomainSpec } from "../src/domain/mock-domain-spec.js";
import { scoreEvalRun, summarizeEvalResults } from "../src/evals/scoring.js";
import type { RunDemoResult } from "../src/orchestrator.js";
import type { DomainSpec } from "../src/domain/domain-spec.js";

describe("eval scoring", () => {
  it("passes when app, trace, context, and docs match the domain spec", async () => {
    const spec = inferDomainSpec("Build an inventory request system for a flower company");
    const result = await scoreEvalRun(spec.sourceGoal, "run", await createEvalFixture(spec), { durationMs: 123 });

    expect(result.requiredAppFilesPresent).toBe(true);
    expect(result.requiredTraceFilesPresent).toBe(true);
    expect(result.finalValidationOk).toBe(true);
    expect(result.contextCoverageOk).toBe(true);
    expect(result.contextProvenanceOk).toBe(true);
    expect(result.domainSpecPresent).toBe(true);
    expect(result.appNameAppearsInApp).toBe(true);
    expect(result.primaryEntityAppearsInApp).toBe(true);
    expect(result.workflowStatusesAppearInApp).toBe(true);
    expect(result.requiredFieldsAppearInApp).toBe(true);
    expect(result.promptLeakageDetected).toBe(false);
    expect(result.templateLeakageDetected).toBe(false);
    expect(result.durationMs).toBe(123);
    expect(result.failureCategory).toBe("none");
    expect(result.failures).toEqual([]);
    expect(summarizeEvalResults([result])).toEqual({ total: 1, passed: 1, failed: 0 });
  });

  it("fails when the trace domain spec drifts from the generated domain", async () => {
    const spec = inferDomainSpec("Build an inventory request system for a flower company");
    const mismatchedSpec = { ...spec, appName: "Client Request Tracker" };
    const result = await scoreEvalRun(spec.sourceGoal, "run", await createEvalFixture(spec, { traceDomainSpec: mismatchedSpec }), { durationMs: 1 });

    expect(result.domainSpecPresent).toBe(true);
    expect(result.failureCategory).toBe("domain_mismatch");
    expect(result.failures).toContain("Trace domain spec appName Client Request Tracker does not match Inventory Request Desk");
  });

  it("fails when required trace files are missing", async () => {
    const spec = inferDomainSpec("Build a booking system for a barber shop");
    const fixture = await createEvalFixture(spec, { omitTraceFiles: ["context-eval.json"] });
    const result = await scoreEvalRun(spec.sourceGoal, "run", fixture, { durationMs: 1 });

    expect(result.requiredTraceFilesPresent).toBe(false);
    expect(result.contextCoverageOk).toBe(false);
    expect(result.contextProvenanceOk).toBe(false);
    expect(result.failureCategory).toBe("missing_trace_file");
    expect(result.failures).toEqual(expect.arrayContaining([
      "Missing trace file: trace/context-eval.json",
      "Missing context evaluation"
    ]));
  });

  it("fails when context eval reports coverage or provenance failures", async () => {
    const spec = inferDomainSpec("Build a clinic appointment system");
    const result = await scoreEvalRun(spec.sourceGoal, "run", await createEvalFixture(spec, {
      contextEvaluation: {
        runId: "run",
        generatedAt: "2026-05-31T00:00:00.000Z",
        packageCount: 1,
        actionCount: 1,
        artifactCount: 1,
        totalItemCount: 1,
        totalChars: 20,
        requiredCoverageOk: false,
        provenanceOk: false,
        failures: ["action context hash mismatch"]
      }
    }), { durationMs: 1 });

    expect(result.contextCoverageOk).toBe(false);
    expect(result.contextProvenanceOk).toBe(false);
    expect(result.failureCategory).toBe("context");
    expect(result.failures).toEqual(expect.arrayContaining([
      "Context evaluation reports incomplete required coverage",
      "Context evaluation reports incomplete provenance",
      "Context evaluation failure: action context hash mismatch"
    ]));
  });

  it("fails when app output omits expected fields and statuses", async () => {
    const spec = inferDomainSpec("Build a restaurant reservation system");
    const result = await scoreEvalRun(spec.sourceGoal, "run", await createEvalFixture(spec, {
      appSource: `export const appConfig = ${JSON.stringify({
        appName: spec.appName,
        primaryEntityName: spec.primaryEntity.name,
        fields: [],
        statuses: []
      })};`
    }), { durationMs: 1 });

    expect(result.workflowStatusesAppearInApp).toBe(false);
    expect(result.requiredFieldsAppearInApp).toBe(false);
    expect(result.failureCategory).toBe("domain_mismatch");
    expect(result.failures).toEqual(expect.arrayContaining([
      "App source does not contain every workflow status",
      "App source does not contain every required field"
    ]));
  });

  it("fails when stale generic or template text leaks into generated output", async () => {
    const spec = inferDomainSpec("Build an equipment checkout system for a university club");
    const result = await scoreEvalRun(spec.sourceGoal, "run", await createEvalFixture(spec, {
      appReadme: `# ${spec.appName}\n\nTODO: Replace Client Request Tracker template placeholder.`
    }), { durationMs: 1 });

    expect(result.templateLeakageDetected).toBe(true);
    expect(result.failureCategory).toBe("runtime");
    expect(result.failures).toContain("Generated package contains stale generic or template placeholder text");
  });
});

async function createEvalFixture(
  spec: DomainSpec,
  options: {
    traceDomainSpec?: DomainSpec;
    contextEvaluation?: unknown;
    omitTraceFiles?: string[];
    appSource?: string;
    appReadme?: string;
  } = {}
): Promise<RunDemoResult> {
  const finalPackageDir = join(tmpdir(), `agentsim-eval-score-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const appSource = options.appSource ?? renderAppSource(spec);
  const appReadme = options.appReadme ?? `# ${spec.appName}\n\nManage ${spec.primaryEntity.pluralName}.`;
  const traceFiles = new Set(options.omitTraceFiles ?? []);
  await writeFixtureFile(finalPackageDir, "app/package.json", JSON.stringify({ name: spec.appSlug }, null, 2));
  await writeFixtureFile(finalPackageDir, "app/src/App.tsx", appSource);
  await writeFixtureFile(finalPackageDir, "app/server.js", "export {};\n");
  await writeFixtureFile(finalPackageDir, "app/README.md", appReadme);
  await writeFixtureFile(finalPackageDir, "planning/requirements.md", `# Requirements\n\n${spec.appName} manages ${spec.primaryEntity.pluralName}.\n`);
  await writeFixtureFile(finalPackageDir, "client/project-summary.md", `# Project Summary\n\n${spec.appName} centers on ${spec.primaryEntity.name}.\n`);

  if (!traceFiles.has("domain-spec.json")) {
    await writeFixtureFile(finalPackageDir, "trace/domain-spec.json", JSON.stringify(options.traceDomainSpec ?? spec, null, 2));
  }
  if (!traceFiles.has("context-eval.json")) {
    await writeFixtureFile(finalPackageDir, "trace/context-eval.json", JSON.stringify({
      evaluation: options.contextEvaluation ?? {
        runId: "run",
        generatedAt: "2026-05-31T00:00:00.000Z",
        packageCount: 1,
        actionCount: 1,
        artifactCount: 1,
        totalItemCount: 3,
        totalChars: 200,
        requiredCoverageOk: true,
        provenanceOk: true,
        failures: []
      }
    }, null, 2));
  }
  if (!traceFiles.has("run-summary.json")) {
    await writeFixtureFile(finalPackageDir, "trace/run-summary.json", JSON.stringify({
      runId: "run",
      goal: spec.sourceGoal,
      status: "COMPLETED",
      modelMode: "mock",
      provider: "deterministic-mock",
      finalPackageDir,
      artifactCount: 1,
      validationResult: { ok: true, failures: [] },
      failures: []
    }, null, 2));
  }

  return {
    taskRun: {
      id: "run",
      goal: spec.sourceGoal,
      startedAt: "2026-05-31T00:00:00.000Z",
      status: "COMPLETED",
      modelMode: "mock",
      outputDir: finalPackageDir
    },
    finalPackageDir,
    artifacts: [],
    decisions: [],
    domainSpec: spec
  };
}

async function writeFixtureFile(root: string, relativePath: string, content: string): Promise<void> {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

function renderAppSource(spec: DomainSpec): string {
  return `export const appConfig = ${JSON.stringify({
    appName: spec.appName,
    primaryEntityName: spec.primaryEntity.name,
    primaryEntityPluralName: spec.primaryEntity.pluralName,
    fields: spec.primaryEntity.fields.map((field) => ({ name: field.name, label: field.label })),
    statuses: spec.workflowStatuses
  }, null, 2)};`;
}
