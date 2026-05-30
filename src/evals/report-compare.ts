import type { EvalReport } from "./run-evals.js";

export interface EvalReportComparison {
  acceptedRunDelta: number;
  averageQualityDelta: number;
  failureCategoryChanges: Record<string, { base: number; head: number; delta: number }>;
  hardGateRegressions: Array<{ caseId: string; baseRunId: string; headRunId: string }>;
  qualityRegressions: Array<{ caseId: string; baseQualityScore: number; headQualityScore: number; delta: number }>;
}

export function compareEvalReports(base: EvalReport, head: EvalReport, options: { qualityRegressionThreshold?: number } = {}): EvalReportComparison {
  const qualityRegressionThreshold = options.qualityRegressionThreshold ?? 0.05;
  const baseByCase = new Map(base.results.map((result) => [result.caseId, result]));
  const headByCase = new Map(head.results.map((result) => [result.caseId, result]));
  const hardGateRegressions: EvalReportComparison["hardGateRegressions"] = [];
  const qualityRegressions: EvalReportComparison["qualityRegressions"] = [];

  for (const [caseId, baseResult] of baseByCase) {
    const headResult = headByCase.get(caseId);
    if (!headResult) {
      continue;
    }
    if (baseResult.hardGatePassed && !headResult.hardGatePassed) {
      hardGateRegressions.push({ caseId, baseRunId: baseResult.runId, headRunId: headResult.runId });
    }
    const delta = round(headResult.qualityScore - baseResult.qualityScore);
    if (delta <= -qualityRegressionThreshold) {
      qualityRegressions.push({
        caseId,
        baseQualityScore: baseResult.qualityScore,
        headQualityScore: headResult.qualityScore,
        delta
      });
    }
  }

  return {
    acceptedRunDelta: head.summary.acceptedRuns - base.summary.acceptedRuns,
    averageQualityDelta: round(head.summary.averageQualityScore - base.summary.averageQualityScore),
    failureCategoryChanges: compareFailureCategories(base.summary.failureCategories, head.summary.failureCategories),
    hardGateRegressions,
    qualityRegressions
  };
}

function compareFailureCategories(base: Record<string, number>, head: Record<string, number>): EvalReportComparison["failureCategoryChanges"] {
  const categories = new Set([...Object.keys(base), ...Object.keys(head)]);
  const changes: EvalReportComparison["failureCategoryChanges"] = {};
  for (const category of [...categories].sort()) {
    const baseCount = base[category] ?? 0;
    const headCount = head[category] ?? 0;
    if (baseCount !== headCount) {
      changes[category] = { base: baseCount, head: headCount, delta: headCount - baseCount };
    }
  }
  return changes;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
