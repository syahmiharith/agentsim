import { describe, expect, it } from "vitest";
import { createFixTask, maxReviewCycles, reviewResultFromValidation, shouldStopReviewLoop } from "../src/core/review-loop.js";
import type { Task } from "../src/types.js";

describe("review loop", () => {
  it("passes successful validation", () => {
    const result = reviewResultFromValidation({ ok: true, failures: [] });
    expect(result.verdict).toBe("pass");
    expect(result.blockingIssues).toEqual([]);
  });

  it("creates a bounded fix task for recoverable review failures", () => {
    const reviewResult = reviewResultFromValidation({
      ok: false,
      failures: ["Missing required final-package file: review/qa-report.md"]
    });
    const fixTask = createFixTask({
      runId: "run-1",
      reviewTask: createReviewTask(),
      reviewResult,
      reviewCycle: 1
    });

    expect(reviewResult.verdict).toBe("revise");
    expect(fixTask.kind).toBe("fix");
    expect(fixTask.assignedAgentId).toBe("builder");
    expect(fixTask.reviewCycle).toBe(2);
  });

  it("stops at max review cycles or attempts and fails unrecoverable reviews", () => {
    const failed = reviewResultFromValidation({ ok: false, failures: ["Unknown owner agent"] });
    expect(failed.verdict).toBe("fail");
    expect(shouldStopReviewLoop({ reviewCycle: maxReviewCycles, taskAttempts: 0 })).toBe(true);
    expect(shouldStopReviewLoop({ reviewCycle: 1, taskAttempts: 2 })).toBe(true);
    expect(() => createFixTask({
      runId: "run-1",
      reviewTask: createReviewTask(),
      reviewResult: { verdict: "revise", blockingIssues: [], requiredFixes: ["fix"], summary: "fix" },
      reviewCycle: maxReviewCycles
    })).toThrow("Maximum review cycles");
  });
});

function createReviewTask(): Task {
  return {
    id: "review-qa-report",
    runId: "run-1",
    title: "run package QA review",
    description: "review",
    kind: "review",
    assignedAgentId: "reviewer-qa",
    status: "completed",
    dependsOn: ["builder-app"],
    requiredArtifactTypes: ["app"],
    outputArtifactType: "qa-report",
    attempts: 1,
    maxAttempts: 2,
    reviewCycle: 1,
    createdAt: "2026-05-31T00:00:00.000Z",
    updatedAt: "2026-05-31T00:00:00.000Z"
  };
}
