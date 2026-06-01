import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export async function createViewerRun(): Promise<string> {
  const runRoot = join(tmpdir(), `agentsim-viewer-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const stateRoot = join(runRoot, "state");
  const finalRoot = join(runRoot, "final-package");
  await writeJson(join(stateRoot, "run.json"), {
    id: "viewer-run",
    userGoal: "Build a viewer test app",
    status: "completed",
    modelMode: "mock",
    outputRoot: "outputs",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:01:00.000Z",
    completedAt: "2026-06-01T00:01:00.000Z",
  });
  await writeJson(join(stateRoot, "tasks.json"), [
    {
      id: "task-1",
      runId: "viewer-run",
      title: "Build app",
      description: "Build app",
      kind: "app_generation",
      assignedAgentId: "builder",
      status: "completed",
      dependsOn: [],
      requiredArtifactTypes: [],
      outputArtifactType: "app",
      attempts: 1,
      maxAttempts: 2,
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:01:00.000Z",
      completedAt: "2026-06-01T00:01:00.000Z",
    },
  ]);
  await writeJson(join(stateRoot, "artifacts.json"), [
    {
      id: "artifact-1",
      type: "project-summary",
      ownerAgentId: "client-intake",
      status: "approved",
      workspacePath: "workspace/artifacts/client/project-summary.md",
      finalPackagePath: "client/project-summary.md",
      lineage: { inputArtifactIds: [] },
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:01:00.000Z",
      reviewStatus: "not_required",
      approvalStatus: "approved",
      contentHash: "hash",
    },
  ]);
  await writeFileSafe(join(finalRoot, "client/project-summary.md"), "# Project Summary\n\nViewer Desk summary.");
  await writeFileSafe(join(finalRoot, "review/qa-report.md"), "# QA Report\n\n## Generated App Validation\n\nPassed.");
  await writeFileSafe(join(finalRoot, "review/code-review.md"), "# Code Review\n\n## Findings\n\nNone.");
  await writeFileSafe(join(finalRoot, "review/known-issues.md"), "# Known Issues\n\nNone.");
  await writeFileSafe(join(finalRoot, "app/test-report.md"), "# Generated App Test Report\n\nPassed.");
  await writeJson(join(finalRoot, "trace/decisions.json"), {
    decisions: [
      {
        id: "decision-1",
        runId: "viewer-run",
        madeAt: "2026-06-01T00:00:00.000Z",
        madeBy: "system",
        title: "Domain",
        rationale: "Selected domain.",
        selectedOption: "Viewer Desk",
      },
    ],
  });
  await writeJson(join(finalRoot, "trace/product-brief.json"), { appName: "Viewer Desk", targetUsers: ["operator"] });
  await writeJson(join(finalRoot, "trace/domain-spec.json"), {
    appName: "Viewer Desk",
    appArchetype: "crud-workflow",
    primaryEntity: { name: "Ticket" },
    targetUsers: ["operator"],
    deferredFeatures: ["Authentication is deferred."],
    unresolvedQuestions: ["Who approves tickets?"],
  });
  await writeJson(join(finalRoot, "trace/app-spec.json"), {
    schemaVersion: 1,
    appName: "Viewer Desk",
    appArchetype: "crud-workflow",
    primaryEntity: { name: "Ticket" },
    targetUsers: ["operator"],
    deferredFeatures: ["Authentication is deferred."],
    unresolvedQuestions: ["Who approves tickets?"],
  });
  await writeJson(join(finalRoot, "trace/app-validation.json"), {
    schemaVersion: 1,
    ok: true,
    checks: [{ id: "shape.required-files", status: "passed", message: "ok" }],
  });
  await writeJson(join(finalRoot, "trace/run-summary.json"), {
    validationResult: { ok: true, failures: [] },
  });
  await writeJson(join(finalRoot, "trace/workflow-graph.json"), { nodes: [], edges: [] });
  await writeJson(join(finalRoot, "trace/tool-registry.json"), { tools: [] });
  await writeFileSafe(
    join(finalRoot, "trace/events.jsonl"),
    `${JSON.stringify({ timestamp: "now", level: "info", name: "run.completed", message: "done" })}\n`,
  );
  await writeFileSafe(
    join(finalRoot, "trace/command-results.jsonl"),
    `${JSON.stringify({ timestamp: "now", command: "node", args: ["--check", "server.js"], cwd: join(finalRoot, "app"), exitCode: 0 })}\n`,
  );
  return runRoot;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFileSafe(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function writeFileSafe(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}
