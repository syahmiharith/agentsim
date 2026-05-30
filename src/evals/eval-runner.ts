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

export interface UseCaseJustification {
  fitScore: number;
  maxScore: number;
  verdict: "strong-fit" | "promising" | "weak-fit";
  reasons: string[];
  evidence: string[];
}

export interface EvalCaseResult {
  case: EvalCase;
  runId: string;
  finalPackageDir: string;
  scorecardPath: string;
  workflow: EvalScore;
  baseline: EvalScore & { packagePath: string };
  justification: UseCaseJustification;
  delta: number;
}

export interface EvalReport {
  evalRunId: string;
  outputDir: string;
  reportPath: string;
  justificationPath: string;
  cases: EvalCaseResult[];
  averageWorkflowScore: number;
  averageBaselineScore: number;
  averageUseCaseFitScore: number;
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
    const delta = workflow.totalScore - baseline.totalScore;
    const justification = assessUseCaseFit({
      evalCase,
      workflow,
      baseline,
      delta,
      finalPackageDir: run.finalPackageDir
    });
    const result: EvalCaseResult = {
      case: evalCase,
      runId: run.taskRun.id,
      finalPackageDir: run.finalPackageDir,
      scorecardPath,
      workflow,
      baseline,
      justification,
      delta
    };

    await writeFile(scorecardPath, JSON.stringify(result, null, 2), "utf8");
    await writeFile(join(casesDir, evalCase.id, "scorecard.md"), renderScorecard(result), "utf8");
    results.push(result);
  }

  const averageWorkflowScore = average(results.map((result) => result.workflow.totalScore));
  const averageBaselineScore = average(results.map((result) => result.baseline.totalScore));
  const averageUseCaseFitScore = average(results.map((result) => result.justification.fitScore));
  const reportPath = join(outputDir, "eval-report.md");
  const justificationPath = join(outputDir, "development-justification.md");
  const report: EvalReport = {
    evalRunId,
    outputDir,
    reportPath,
    justificationPath,
    cases: results,
    averageWorkflowScore,
    averageBaselineScore,
    averageUseCaseFitScore
  };

  await writeFile(reportPath, renderEvalReport(report), "utf8");
  await writeFile(justificationPath, renderDevelopmentJustification(report), "utf8");
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

## Use Case

- Target user: ${evalCase.useCase.targetUser}
- Scenario: ${evalCase.useCase.scenario}
- Product fit: ${evalCase.useCase.productFit}

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

## Use-Case Justification

- Target user: ${result.case.useCase.targetUser}
- Scenario: ${result.case.useCase.scenario}
- Product fit: ${result.case.useCase.productFit}
- Business justification: ${result.case.useCase.businessJustification}
- Why Agentsim: ${result.case.useCase.whyAgentsim}
- One-shot failure mode: ${result.case.useCase.oneShotFailureMode}
- Fit verdict: ${result.justification.verdict} (${result.justification.fitScore}/${result.justification.maxScore})

| Measure | Workflow | One-shot baseline |
| --- | ---: | ---: |
| Total | ${result.workflow.totalScore}/${result.workflow.maxScore} | ${result.baseline.totalScore}/${result.baseline.maxScore} |
| Delta | +${result.delta} | - |

## Workflow Criteria

${result.workflow.criteria.map((criterionScore) => `- ${criterionScore.label}: ${criterionScore.score}/${criterionScore.maxScore} - ${criterionScore.notes}`).join("\n")}

## Baseline Criteria

${result.baseline.criteria.map((criterionScore) => `- ${criterionScore.label}: ${criterionScore.score}/${criterionScore.maxScore} - ${criterionScore.notes}`).join("\n")}

## Fit Evidence

${result.justification.evidence.map((item) => `- ${item}`).join("\n")}

## Output

- Final package: \`${result.finalPackageDir}\`
- Baseline package: \`${result.baseline.packagePath}\`
`;
}

function renderEvalReport(report: EvalReport): string {
  const rows = report.cases.map((result) =>
    `| ${result.case.title} | ${result.justification.verdict} | ${result.workflow.totalScore}/${result.workflow.maxScore} | ${result.baseline.totalScore}/${result.baseline.maxScore} | +${result.delta} | \`${result.finalPackageDir}\` |`
  ).join("\n");

  const losses = report.cases.filter((result) => result.delta <= 0);
  const strongFits = report.cases.filter((result) => result.justification.verdict === "strong-fit");
  return `# Agentsim Eval Report

Eval run ID: ${report.evalRunId}

| Case | Use-case fit | Workflow | One-shot baseline | Delta | Final package |
| --- | --- | ---: | ---: | ---: | --- |
${rows}

## Summary

- Average workflow score: ${report.averageWorkflowScore.toFixed(1)}
- Average one-shot baseline score: ${report.averageBaselineScore.toFixed(1)}
- Average use-case fit score: ${report.averageUseCaseFitScore.toFixed(1)}/5
- Strong-fit use cases: ${strongFits.length}/${report.cases.length}
- Cases where workflow did not beat baseline: ${losses.length === 0 ? "none" : losses.map((result) => result.case.id).join(", ")}
- Development justification: \`${report.justificationPath}\`

## Interpretation

Agentsim scores higher when the artifact-first workflow produces a complete package, runnable prototype, explicit QA artifacts, and inspectable trace files. The baseline is useful for initial ideation, but it does not create durable delivery assets or review evidence.
`;
}

function renderDevelopmentJustification(report: EvalReport): string {
  const ranked = [...report.cases].sort((a, b) => b.justification.fitScore - a.justification.fitScore || b.delta - a.delta);
  const rows = ranked.map((result) =>
    `| ${result.case.title} | ${result.justification.verdict} | ${result.justification.fitScore}/${result.justification.maxScore} | ${result.delta} | ${result.case.useCase.businessJustification} |`
  ).join("\n");
  const topCases = ranked.filter((result) => result.justification.verdict === "strong-fit").slice(0, 3);
  const weakCases = ranked.filter((result) => result.justification.verdict === "weak-fit");

  return `# Agentsim Development Justification

Eval run ID: ${report.evalRunId}

## Verdict

Agentsim is justified when the target job is not "answer a question", but "produce a reviewed, runnable, traceable delivery package from a vague client request." The current eval evidence supports continuing the software-freelance wedge if future work keeps improving package quality, app runnability, and real-model baseline comparison.

## Public Promotion Gate

Do not promote Agentsim publicly for broad contribution until benchmark runs show it is at least equal to strong one-shot model baselines on throughput and better on delivery-package quality. Minimum evidence should include:

- comparable or better time-to-reviewed-package for the same client request
- equal or better runnable app success rate
- stronger handoff completeness, QA coverage, and traceability than a one-shot ChatGPT/Claude-style prompt
- repeatable results across the core freelance use cases, not only one demo prompt

## Best Initial Use Cases

${topCases.map((result) => `- ${result.case.title}: ${result.case.useCase.whyAgentsim}`).join("\n") || "- No strong-fit use cases found in this run."}

## Use-Case Matrix

| Use case | Fit | Fit score | Workflow delta | Why it matters |
| --- | --- | ---: | ---: | --- |
${rows}

## What This Eval Proves

- The workflow can generate a consistent final-package shape across multiple plausible freelance requests.
- The package includes client, planning, technical, review, app, and trace artifacts.
- The strongest use cases are client work where scope, review, runnable proof, and handoff discipline matter together.
- The weakest use cases should either be reframed as workflow/handoff packages or deferred until Agentsim can prove more domain-specific value.

## What This Eval Does Not Prove Yet

- It does not prove superiority against live ChatGPT, Claude, or other current model outputs unless a live one-shot baseline is added.
- It does not prove the generated apps are production-ready.
- It does not measure actual freelancer time saved, client acceptance rate, or revision reduction.

## Recommended Next Evidence

- Add a live one-shot baseline mode for OpenAI-compatible and Anthropic-style providers.
- Run generated app install/build checks and include command traces.
- Track human review time and number of manual edits needed before client handoff.
- Add at least one real freelancer project transcript converted into an eval case.

${weakCases.length > 0 ? `## Weak-Fit Cases\n\n${weakCases.map((result) => `- ${result.case.title}: ${result.case.useCase.oneShotFailureMode}`).join("\n")}\n` : ""}
`;
}

function assessUseCaseFit(input: {
  evalCase: EvalCase;
  workflow: EvalScore;
  baseline: EvalScore;
  delta: number;
  finalPackageDir: string;
}): UseCaseJustification {
  const reasons: string[] = [];
  const evidence: string[] = [];
  const workflowRatio = input.workflow.totalScore / input.workflow.maxScore;
  const baselineRatio = input.baseline.totalScore / input.baseline.maxScore;
  const runnableScore = criterionScore(input.workflow, "runnable-app");
  const qaScore = criterionScore(input.workflow, "qa-quality");
  const traceScore = criterionScore(input.workflow, "traceability");
  const completenessScore = criterionScore(input.workflow, "requirement-completeness");

  let fitScore = 0;
  if (workflowRatio >= 0.8) {
    fitScore += 1;
    reasons.push("workflow package quality cleared the useful-output threshold");
  }
  if (input.delta >= 10 && workflowRatio > baselineRatio) {
    fitScore += 1;
    reasons.push("structured workflow materially outscored the one-shot baseline");
  }
  if (runnableScore >= 4) {
    fitScore += 1;
    reasons.push("the use case benefits from a runnable local prototype");
  }
  if (qaScore >= 4 && traceScore >= 4) {
    fitScore += 1;
    reasons.push("review and traceability are visible enough to support client handoff");
  }
  if (completenessScore >= 4 && input.evalCase.useCase.proofSignals.length >= 4) {
    fitScore += 1;
    reasons.push("the package produced the artifact classes needed to evaluate the business workflow");
  }

  const cap = input.evalCase.useCase.productFit === "core-wedge"
    ? 5
    : input.evalCase.useCase.productFit === "adjacent-wedge"
      ? 4
      : 3;
  if (fitScore > cap) {
    fitScore = cap;
    reasons.push(`fit score capped at ${cap}/5 because this is classified as ${input.evalCase.useCase.productFit}`);
  }

  evidence.push(`Final package: ${input.finalPackageDir}`);
  evidence.push(`Expected proof signals: ${input.evalCase.useCase.proofSignals.join(", ")}`);
  evidence.push(`Workflow score: ${input.workflow.totalScore}/${input.workflow.maxScore}`);
  evidence.push(`One-shot baseline score: ${input.baseline.totalScore}/${input.baseline.maxScore}`);
  evidence.push(`Delta: +${input.delta}`);

  return {
    fitScore,
    maxScore: 5,
    verdict: fitScore >= 4 ? "strong-fit" : fitScore >= 3 ? "promising" : "weak-fit",
    reasons,
    evidence
  };
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

function criterionScore(scorecard: EvalScore, criterionId: string): number {
  return scorecard.criteria.find((criterionItem) => criterionItem.id === criterionId)?.score ?? 0;
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
