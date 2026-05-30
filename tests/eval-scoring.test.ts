import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scoreEvalRun, summarizeEvalResults } from "../src/evals/scoring.js";
import type { RunDemoResult } from "../src/orchestrator.js";

describe("eval scoring", () => {
  it("scores required generated app files", async () => {
    const finalPackageDir = join(tmpdir(), `agentsim-eval-score-${Date.now()}`);
    for (const relativePath of ["package.json", "src/App.tsx", "server.js", "README.md"]) {
      const path = join(finalPackageDir, "app", relativePath);
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, "ok", "utf8");
    }

    const result = await scoreEvalRun("prompt", "run", {
      taskRun: {
        id: "run",
        goal: "prompt",
        startedAt: "2026-05-31T00:00:00.000Z",
        status: "COMPLETED",
        modelMode: "mock",
        outputDir: finalPackageDir
      },
      finalPackageDir,
      artifacts: [],
      decisions: [],
      domainSpec: {} as RunDemoResult["domainSpec"]
    });

    expect(result.requiredAppFilesPresent).toBe(true);
    expect(summarizeEvalResults([result])).toEqual({ total: 1, passed: 1, failed: 0 });
  });
});
