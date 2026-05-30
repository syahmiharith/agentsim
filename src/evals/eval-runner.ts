import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MockModelProvider } from "../providers/mock-model-provider.js";
import { softwareFreelancePack } from "../domain/software-freelance-pack.js";
import { runDemo } from "../workflow.js";
import type { DomainSpec } from "../domain/domain-spec.js";
import type { ModelProvider, ValidationResult } from "../types.js";
import { softwareFreelanceEvalCases, type EvalCase } from "./cases.js";

export interface EvalCriterionScore {
  id: string;
  label: string;
  score: number;
  maxScore: number;
  notes: string;
}

export interface EvalScore {
  totalScore: number;
  maxScore: number;
  criteria: EvalCriterionScore[];
}

export interface EvalCaseResult {
  case: EvalCase;
  runId: string;
  finalPackageDir: string;
  scorecardPath: string;
  workflow: EvalScore;
  baseline: EvalScore & { packagePath: string };
  delta: number;
}

export interface EvalReport {
  evalRunId: string;
  outputDir: string;
  reportPath: string;
  cases: EvalCaseResult[];
  averageWorkflowScore: number;
  averageBaselineScore: number;
}

export interface RunEvalsOptions {
  outputRoot?: string;
  evalRunId?: string;
  modelProvider?: ModelProvider;
  cases?: EvalCase[];
}

export async function runEvals(options: RunEvalsOptions = {}): Promise<EvalReport> {
  const evalRunId = options.evalRunId ?? createEvalRunId();
  const outputDir = join(options.outputRoot ?? "outputs/evals", evalRunId);
  const casesDir = join(outputDir, "cases");
  const baselineDir = join(outputDir, "baseline");
  const cases = options.cases ?? softwareFreelanceEvalCases;
  const provider = options.modelProvider ?? new MockModelProvider();

  await mkdir(casesDir, { recursive: true });
  await mkdir(baselineDir, { recursive: true });

  const results: EvalCaseResult[] = [];
  for (const evalCase of cases) {
    const run = await runDemo({
      goal: evalCase.goal,
      outputRoot: casesDir,
      runId: evalCase.id,
      modelProvider: provider
    });
    const domainSpec = await readJson<DomainSpec>(join(run.finalPackageDir, "trace", "domain-spec.json"));
    const runSummary = await readJson<{ validationResult: ValidationResult }>(join(run.finalPackageDir, "trace", "run-summary.json"));
    const workflow = await scoreWorkflowPackage({
      evalCase,
      finalPackageDir: run.finalPackageDir,
      artifactCount: run.artifacts.length,
      domainSpec,
      validationResult: runSummary.validationResult
    });
    const baseline = await writeBaselinePackage(evalCase, baselineDir);
    const scorecardPath = join(casesDir, evalCase.id, "scorecard.json");
    const result: EvalCaseResult = {
      case: evalCase,
      runId: run.taskRun.id,
      finalPackageDir: run.finalPackageDir,
      scorecardPath,
      workflow,
      baseline,
      delta: workflow.totalScore - baseline.totalScore
    };

    await writeFile(scorecardPath, JSON.stringify(result, null, 2), "utf8");
    await writeFile(join(casesDir, evalCase.id, "scorecard.md"), renderScorecard(result), "utf8");
    results.push(result);
  }

  const averageWorkflowScore = average(results.map((result) => result.workflow.totalScore));
  const averageBaselineScore = average(results.map((result) => result.baseline.totalScore));
  const reportPath = join(outputDir, "eval-report.md");
  const report: EvalReport = {
    evalRunId,
    outputDir,
    reportPath,
    cases: results,
    averageWorkflowScore,
    averageBaselineScore
  };

  await writeFile(reportPath, renderEvalReport(report), "utf8");
  await writeFile(join(outputDir, "eval-report.json"), JSON.stringify(report, null, 2), "utf8");
  return report;
}

async function scoreWorkflowPackage(input: {
  evalCase: EvalCase;
  finalPackageDir: string;
  artifactCount: number;
  domainSpec: DomainSpec;
  validationResult: ValidationResult;
}): Promise<EvalScore> {
  const requirements = await readOptional(join(input.finalPackageDir, "planning/requirements.md"));
  const projectSummary = await readOptional(join(input.finalPackageDir, "client/project-summary.md"));
  const userGuide = await readOptional(join(input.finalPackageDir, "client/user-guide.md"));
  const architecture = await readOptional(join(input.finalPackageDir, "technical/architecture.md"));
  const apiPlan = await readOptional(join(input.finalPackageDir, "technical/api-plan.md"));
  const databaseSchema = await readOptional(join(input.finalPackageDir, "technical/database-schema.md"));
  const qaReport = await readOptional(join(input.finalPackageDir, "review/qa-report.md"));
  const codeReview = await readOptional(join(input.finalPackageDir, "review/code-review.md"));
  const knownIssues = await readOptional(join(input.finalPackageDir, "review/known-issues.md"));
  const appReadme = await readOptional(join(input.finalPackageDir, "app/README.md"));
  const appSource = await readOptional(join(input.finalPackageDir, "app/src/App.tsx"));

  const requiredTraceFiles = await countExisting(input.finalPackageDir, softwareFreelancePack.requiredTraceFiles);
  const requiredAppFiles = await countExisting(input.finalPackageDir, [
    "app/package.json",
    "app/index.html",
    "app/server.js",
    "app/src/App.tsx",
    "app/src/main.tsx",
    "app/src/styles.css",
    "app/README.md"
  ]);
  const clientText = `${projectSummary}\n${userGuide}`;
  const technicalText = `${architecture}\n${apiPlan}\n${databaseSchema}`;
  const reviewText = `${qaReport}\n${codeReview}\n${knownIssues}`;

  return score([
    {
      id: "requirement-completeness",
      label: "Requirement completeness",
      score: input.validationResult.ok && input.artifactCount >= softwareFreelancePack.artifactManifest.filter((item) => item.required).length ? 5 : 2,
      maxScore: 5,
      notes: input.validationResult.ok ? "Required artifacts and final package files are present." : input.validationResult.failures.join("; ")
    },
    {
      id: "runnable-app",
      label: "Runnable app",
      score: requiredAppFiles === 7 && appReadme.includes("pnpm dev:api") && appReadme.includes("pnpm dev:web") ? 5 : Math.max(0, requiredAppFiles - 2),
      maxScore: 5,
      notes: `${requiredAppFiles}/7 app files found with local run instructions.`
    },
    {
      id: "client-clarity",
      label: "Client clarity",
      score: textIncludesAll(clientText, [input.evalCase.goal, input.evalCase.expectedAppName, input.evalCase.expectedEntityName]) ? 5 : 3,
      maxScore: 5,
      notes: "Client summary and user guide are checked against the goal, app name, and primary entity."
    },
    {
      id: "technical-clarity",
      label: "Technical clarity",
      score: textIncludesAll(technicalText, [input.domainSpec.primaryEntity.slug, "GET", "POST", "Local JSON"]) ? 5 : 3,
      maxScore: 5,
      notes: "Architecture, API plan, and data model explain the generated app structure."
    },
    {
      id: "qa-quality",
      label: "QA quality",
      score: textIncludesAll(reviewText, ["QA Report", "Code Review", "Known Issues"]) ? 5 : 2,
      maxScore: 5,
      notes: "Review artifacts explicitly document QA, code review, and known limitations."
    },
    {
      id: "traceability",
      label: "Traceability",
      score: requiredTraceFiles === softwareFreelancePack.requiredTraceFiles.length && appSource.includes(input.evalCase.expectedAppName) && input.evalCase.expectedStatuses.every((status) => appSource.includes(status)) ? 5 : 3,
      maxScore: 5,
      notes: `${requiredTraceFiles}/${softwareFreelancePack.requiredTraceFiles.length} trace files found; generated app checked for expected status language.`
    }
  ]);
}

async function writeBaselinePackage(evalCase: EvalCase, baselineDir: string): Promise<EvalScore & { packagePath: string }> {
  const caseDir = join(baselineDir, evalCase.id);
  const packagePath = join(caseDir, "one-shot-package.md");
  await mkdir(caseDir, { recursive: true });
  await writeFile(packagePath, `# One-Shot Baseline: ${evalCase.title}

## Prompt

${evalCase.goal}

## Simulated Output

A single prompt can outline a plausible ${evalCase.expectedEntityName.toLowerCase()} workflow, but this baseline intentionally has no durable artifact lineage, reviewed final-package structure, runnable app files, approval records, or event trace.

## Suggested Scope

- Create records.
- View records.
- Update status.
- Add a short handoff note.
`, "utf8");

  return {
    ...score([
      criterion("requirement-completeness", "Requirement completeness", 2, "A one-shot answer can mention scope, but it does not produce the required package tree."),
      criterion("runnable-app", "Runnable app", 0, "No runnable app files are generated."),
      criterion("client-clarity", "Client clarity", 3, "The summary can be readable, but it is not backed by package artifacts."),
      criterion("technical-clarity", "Technical clarity", 2, "Architecture is only described at a high level."),
      criterion("qa-quality", "QA quality", 1, "No separate QA or code-review pass is produced."),
      criterion("traceability", "Traceability", 0, "No events, approvals, decisions, or artifact lineage are produced.")
    ]),
    packagePath
  };
}

function renderScorecard(result: EvalCaseResult): string {
  return `# Eval Scorecard: ${result.case.title}

Goal: ${result.case.goal}

| Measure | Workflow | One-shot baseline |
| --- | ---: | ---: |
| Total | ${result.workflow.totalScore}/${result.workflow.maxScore} | ${result.baseline.totalScore}/${result.baseline.maxScore} |
| Delta | +${result.delta} | - |

## Workflow Criteria

${result.workflow.criteria.map((criterionScore) => `- ${criterionScore.label}: ${criterionScore.score}/${criterionScore.maxScore} - ${criterionScore.notes}`).join("\n")}

## Baseline Criteria

${result.baseline.criteria.map((criterionScore) => `- ${criterionScore.label}: ${criterionScore.score}/${criterionScore.maxScore} - ${criterionScore.notes}`).join("\n")}

## Output

- Final package: \`${result.finalPackageDir}\`
- Baseline package: \`${result.baseline.packagePath}\`
`;
}

function renderEvalReport(report: EvalReport): string {
  const rows = report.cases.map((result) =>
    `| ${result.case.title} | ${result.workflow.totalScore}/${result.workflow.maxScore} | ${result.baseline.totalScore}/${result.baseline.maxScore} | +${result.delta} | \`${result.finalPackageDir}\` |`
  ).join("\n");

  const losses = report.cases.filter((result) => result.delta <= 0);
  return `# Agentsim Eval Report

Eval run ID: ${report.evalRunId}

| Case | Workflow | One-shot baseline | Delta | Final package |
| --- | ---: | ---: | ---: | --- |
${rows}

## Summary

- Average workflow score: ${report.averageWorkflowScore.toFixed(1)}
- Average one-shot baseline score: ${report.averageBaselineScore.toFixed(1)}
- Cases where workflow did not beat baseline: ${losses.length === 0 ? "none" : losses.map((result) => result.case.id).join(", ")}

## Interpretation

Agentsim scores higher when the artifact-first workflow produces a complete package, runnable prototype, explicit QA artifacts, and inspectable trace files. The baseline is useful for initial ideation, but it does not create durable delivery assets or review evidence.
`;
}

function score(criteria: EvalCriterionScore[]): EvalScore {
  return {
    criteria,
    totalScore: criteria.reduce((total, item) => total + item.score, 0),
    maxScore: criteria.reduce((total, item) => total + item.maxScore, 0)
  };
}

function criterion(id: string, label: string, scoreValue: number, notes: string): EvalCriterionScore {
  return { id, label, score: scoreValue, maxScore: 5, notes };
}

async function countExisting(root: string, relativePaths: string[]): Promise<number> {
  let count = 0;
  for (const relativePath of relativePaths) {
    if (await pathExists(join(root, relativePath))) {
      count += 1;
    }
  }
  return count;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readOptional(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

function textIncludesAll(text: string, needles: string[]): boolean {
  const normalized = text.toLowerCase();
  return needles.every((needle) => normalized.includes(needle.toLowerCase()));
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function createEvalRunId(): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
  return `eval-${stamp}`;
}
