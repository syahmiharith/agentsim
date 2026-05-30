import { mkdtemp, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { MockModelProvider } from "../src/providers/mock-model-provider.js";
import { runDemo } from "../src/workflow.js";

describe("demo workflow", () => {
  it("creates the required final package in mock mode", async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), "agentsim-test-"));
    const result = await runDemo({
      goal: "Build an inventory request system for a flower company",
      outputRoot,
      runId: "test-run",
      modelProvider: new MockModelProvider()
    });

    expect(result.taskRun.status).toBe("completed");
    expect(result.artifacts.length).toBeGreaterThanOrEqual(15);

    const required = [
      "client/proposal.md",
      "client/project-summary.md",
      "client/handoff-guide.md",
      "planning/requirements.md",
      "planning/scope.md",
      "planning/assumptions.md",
      "planning/timeline.md",
      "planning/risks.md",
      "planning/task-breakdown.md",
      "technical/architecture.md",
      "technical/database-schema.md",
      "technical/api-plan.md",
      "app/package.json",
      "app/src/App.tsx",
      "app/server.js",
      "app/README.md",
      "review/qa-report.md",
      "review/code-review.md",
      "review/known-issues.md",
      "trace/events.jsonl",
      "trace/approvals.json",
      "trace/decisions.json",
      "trace/artifact-lineage.json"
    ];

    for (const relativePath of required) {
      await expect(stat(join(result.finalPackageDir, relativePath))).resolves.toBeTruthy();
    }

    const lineage = JSON.parse(await readFile(join(result.finalPackageDir, "trace", "artifact-lineage.json"), "utf8"));
    expect(lineage.artifacts.every((artifact: { contentHash?: string }) => Boolean(artifact.contentHash))).toBe(true);

    const events = await readFile(join(result.finalPackageDir, "trace", "events.jsonl"), "utf8");
    expect(events).toContain("run.completed");

    const appReadme = await readFile(join(result.finalPackageDir, "app", "README.md"), "utf8");
    expect(appReadme).toContain("pnpm dev:api");
    expect(appReadme).toContain("pnpm dev:web");
  });
});
