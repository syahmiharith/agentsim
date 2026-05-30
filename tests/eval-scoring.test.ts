import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { inferDomainSpec } from "../src/domain/mock-domain-spec.js";
import { softwareFreelancePack } from "../src/domain/software-freelance-pack.js";
import { scoreEvalRun, summarizeEvalResults } from "../src/evals/scoring.js";
import type { DomainSpec } from "../src/domain/domain-spec.js";
import type { RunDemoResult } from "../src/orchestrator.js";

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
    expect(summarizeEvalResults([result])).toMatchObject({ total: 1, passed: 1, failed: 0, acceptedRuns: 1 });
  });

  it("fails when the trace domain spec drifts from the generated domain", async () => {
    const spec = inferDomainSpec("Build an inventory request system for a flower company");
    const mismatchedSpec = { ...spec, appName: "Client Request Tracker" };
    const result = await scoreEvalRun(spec.sourceGoal, "run", await createEvalFixture(spec, { traceDomainSpec: mismatchedSpec }), { durationMs: 1 });

    expect(result.domainSpecPresent).toBe(true);
    expect(result.failureCategory).toBe("domain_mismatch");
    expect(result.failures).toContainEqual(expect.objectContaining({
      code: "domain_app_name_mismatch",
      actual: "Client Request Tracker",
      expected: "Inventory Request Desk"
    }));
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
      expect.objectContaining({ code: "trace_file_missing", path: "trace/context-eval.json" }),
      expect.objectContaining({ code: "context_eval_missing", path: "trace/context-eval.json" })
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
      expect.objectContaining({ code: "context_coverage_failed" }),
      expect.objectContaining({ code: "context_provenance_failed" }),
      expect.objectContaining({ code: "context_eval_failure", message: "Context evaluation failure: action context hash mismatch" })
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
      expect.objectContaining({ code: "workflow_statuses_missing" }),
      expect.objectContaining({ code: "required_fields_missing" })
    ]));
  });

  it("fails when stale generic or template text leaks into generated output", async () => {
    const spec = inferDomainSpec("Build an equipment checkout system for a university club");
    const result = await scoreEvalRun(spec.sourceGoal, "run", await createEvalFixture(spec, {
      appReadme: `# ${spec.appName}\n\nTODO: Replace Client Request Tracker template placeholder.`
    }), { durationMs: 1 });

    expect(result.templateLeakageDetected).toBe(true);
    expect(result.failureCategory).toBe("runtime");
    expect(result.failures).toContainEqual(expect.objectContaining({ code: "template_text_leaked" }));
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
  const omittedTraceFiles = new Set(options.omitTraceFiles ?? []);
  await writeRequiredFinalPackageFiles(finalPackageDir, spec, appSource, appReadme);

  if (!omittedTraceFiles.has("domain-spec.json")) {
    await writeFixtureFile(finalPackageDir, "trace/domain-spec.json", JSON.stringify(options.traceDomainSpec ?? spec, null, 2));
  }
  if (!omittedTraceFiles.has("context-eval.json")) {
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
  if (!omittedTraceFiles.has("run-summary.json")) {
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
  await writeOtherTraceFiles(finalPackageDir, omittedTraceFiles);

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

async function writeRequiredFinalPackageFiles(finalPackageDir: string, spec: DomainSpec, appSource: string, appReadme: string): Promise<void> {
  for (const relativePath of softwareFreelancePack.requiredFinalPackageFiles) {
    await writeFixtureFile(finalPackageDir, relativePath, requiredFileContent(relativePath, spec, appSource, appReadme));
  }
}

function requiredFileContent(relativePath: string, spec: DomainSpec, appSource: string, appReadme: string): string {
  switch (relativePath) {
    case "app/package.json":
      return JSON.stringify({ name: spec.appSlug, scripts: { build: "echo build-ok" } }, null, 2);
    case "app/src/App.tsx":
      return appSource;
    case "app/server.js":
      return "export {};\n";
    case "app/README.md":
      return appReadme;
    case "app/index.html":
      return `<div id="root">${spec.appName}</div>\n`;
    case "app/src/main.tsx":
      return `import "./App";\n`;
    case "app/src/styles.css":
      return ":root { color-scheme: light; }\n";
    default:
      return `# ${relativePath}\n\n${spec.appName} supports ${spec.primaryEntity.name} workflows for ${spec.primaryEntity.pluralName}.\n`;
  }
}

async function writeOtherTraceFiles(finalPackageDir: string, omittedFileNames: Set<string>): Promise<void> {
  for (const relativePath of softwareFreelancePack.requiredTraceFiles) {
    const fileName = relativePath.replace(/^trace\//, "");
    if (omittedFileNames.has(fileName) || fileName === "domain-spec.json" || fileName === "context-eval.json") {
      continue;
    }
    await writeFixtureFile(finalPackageDir, relativePath, traceFileContent(fileName));
  }
}

function traceFileContent(fileName: string): string {
  if (fileName === "events.jsonl") {
    return "";
  }
  return JSON.stringify(traceFileJson(fileName), null, 2);
}

function traceFileJson(fileName: string): unknown {
  switch (fileName) {
    case "agent-messages.json":
      return { messages: [] };
    case "agent-actions.json":
      return { actions: [] };
    case "context-packages.json":
      return { contextPackages: [] };
    case "approvals.json":
      return { approvals: [] };
    case "decisions.json":
      return { decisions: [] };
    case "artifact-lineage.json":
      return { artifacts: [] };
    default:
      return {};
  }
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
