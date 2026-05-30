import { mkdtemp, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { softwareFreelanceEvalCases } from "../src/evals/cases.js";
import { runEvals } from "../src/evals/eval-runner.js";
import { MockModelProvider } from "../src/providers/mock-model-provider.js";

describe("eval runner", () => {
  it("writes scorecards and a report comparing workflow output against a one-shot baseline", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "agentsim-evals-test-"));
    const report = await runEvals({
      outputRoot,
      evalRunId: "eval-test",
      cases: softwareFreelanceEvalCases.slice(0, 2),
      modelProvider: new MockModelProvider()
    });

    expect(report.cases).toHaveLength(2);
    expect(report.averageWorkflowScore).toBeGreaterThan(report.averageBaselineScore);
    expect(report.averageUseCaseFitScore).toBeGreaterThanOrEqual(4);
    await expect(stat(report.reportPath)).resolves.toBeTruthy();
    await expect(stat(report.justificationPath)).resolves.toBeTruthy();

    for (const result of report.cases) {
      expect(result.workflow.totalScore).toBeGreaterThan(result.baseline.totalScore);
      expect(result.justification.verdict).toBe("strong-fit");
      await expect(stat(result.scorecardPath)).resolves.toBeTruthy();
      await expect(stat(join(outputRoot, "eval-test", "baseline", result.case.id, "one-shot-package.md"))).resolves.toBeTruthy();
      const scorecard = await readFile(result.scorecardPath.replace(/\.json$/, ".md"), "utf8");
      expect(scorecard).toContain("One-shot baseline");
      expect(scorecard).toContain("Use-Case Justification");
    }

    const reportMarkdown = await readFile(report.reportPath, "utf8");
    expect(reportMarkdown).toContain("Agentsim Eval Report");
    expect(reportMarkdown).toContain("Inventory request system");
    expect(reportMarkdown).toContain("Development justification");

    const justificationMarkdown = await readFile(report.justificationPath, "utf8");
    expect(justificationMarkdown).toContain("Agentsim Development Justification");
    expect(justificationMarkdown).toContain("Best Initial Use Cases");
    expect(justificationMarkdown).toContain("does not prove superiority against live ChatGPT");
  });
});
