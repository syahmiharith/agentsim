import { randomUUID } from "node:crypto";
import type { ReviewResult, Task } from "../types.js";

export const maxReviewCycles = 3;

export function reviewResultFromValidation(input: { ok: boolean; failures: string[] }): ReviewResult {
  if (input.ok) {
    return {
      verdict: "pass",
      blockingIssues: [],
      requiredFixes: [],
      summary: "Validation passed."
    };
  }

  const recoverable = input.failures.every((failure) =>
    failure.includes("Missing required") ||
    failure.includes("contentHash") ||
    failure.includes("review") ||
    failure.includes("trace")
  );

  return {
    verdict: recoverable ? "revise" : "fail",
    blockingIssues: input.failures,
    requiredFixes: recoverable ? input.failures : [],
    summary: recoverable ? "Validation found fixable package issues." : "Validation found unrecoverable package issues."
  };
}

export function createFixTask(input: {
  runId: string;
  reviewTask: Task;
  reviewResult: ReviewResult;
  reviewCycle: number;
}): Task {
  if (input.reviewResult.verdict !== "revise") {
    throw new Error("Fix tasks can only be created for revise review results.");
  }
  if (input.reviewCycle >= maxReviewCycles) {
    throw new Error(`Maximum review cycles reached: ${maxReviewCycles}`);
  }

  const now = new Date().toISOString();
  return {
    id: `fix-${input.reviewTask.id}-${randomUUID()}`,
    runId: input.runId,
    title: `Fix review blockers for ${input.reviewTask.title}`,
    description: input.reviewResult.requiredFixes.join("\n"),
    kind: "fix",
    assignedAgentId: "builder",
    status: "pending",
    dependsOn: [input.reviewTask.id],
    requiredArtifactTypes: input.reviewTask.outputArtifactType ? [input.reviewTask.outputArtifactType] : [],
    attempts: 0,
    maxAttempts: 2,
    reviewCycle: input.reviewCycle + 1,
    createdAt: now,
    updatedAt: now
  };
}

export function shouldStopReviewLoop(input: { reviewCycle: number; taskAttempts: number; maxTaskAttempts?: number }): boolean {
  return input.reviewCycle >= maxReviewCycles || input.taskAttempts >= (input.maxTaskAttempts ?? 2);
}
